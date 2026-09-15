import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { HostsAuthSession } from '@shared/types'
import { getSystemHostsPath } from './paths'
import { buildMacHelperScript, buildWinHelperScript } from './elevateHelperScripts'

const execFileAsync = promisify(execFile)

/** 授权会话空闲续期（滑动窗口） */
export const HOSTS_AUTH_SESSION_TTL_MS = 10 * 60 * 1000

const WRITE_TIMEOUT_MS = 30_000
const AUTH_WAIT_MS = 180_000
const POLL_MS = 40

/**
 * 提权写入 + 会话复用：
 * - macOS：首次 osascript 执行 bootstrap（写 hosts + 用 python 拉起脱离会话的 helper）；之后走文件 IPC，免密约 10 分钟
 * - Windows：UAC 拉起 helper 会话
 *
 * 关键点：Electron 只等 write-done/ready 文件，绝不长时间 await osascript 进程本身。
 */
export class HostsElevateSession {
  private sessionDir: string | null = null
  private startLock: Promise<void> | null = null
  /** 滑动窗口截止时间（与 helper DEADLINE 对齐，成功写/启会话后刷新） */
  private idleExpiresAt: number | null = null
  private onAuthChange: ((info: HostsAuthSession) => void) | null = null

  setOnAuthChange(handler: ((info: HostsAuthSession) => void) | null): void {
    this.onAuthChange = handler
  }

  /** 当前免密会话状态（供 UI 展示下次需授权时间） */
  getAuthSession(): HostsAuthSession {
    const alive = this.isSessionAlive()
    const expiresAt =
      alive && this.idleExpiresAt && this.idleExpiresAt > Date.now() ? this.idleExpiresAt : null
    return {
      active: expiresAt !== null,
      expiresAt,
      ttlMs: HOSTS_AUTH_SESSION_TTL_MS
    }
  }

  async writeHosts(content: string): Promise<void> {
    if (process.platform === 'darwin') {
      await this.writeHostsMac(content)
    } else if (process.platform === 'win32') {
      await this.writeHostsWin(content)
    } else {
      throw new Error('仅支持 macOS 与 Windows')
    }
  }

  async dispose(): Promise<void> {
    if (!this.sessionDir) {
      this.clearAuth()
      return
    }
    try {
      await this.roundTrip(['SHUTDOWN'], 2_000)
    } catch {
      // ignore
    }
    this.cleanupDir()
    this.sessionDir = null
    this.startLock = null
    this.clearAuth()
  }

  /** 成功写入或会话拉起后刷新滑动截止时间 */
  private touchAuth(): void {
    this.idleExpiresAt = Date.now() + HOSTS_AUTH_SESSION_TTL_MS
    this.onAuthChange?.(this.getAuthSession())
  }

  private clearAuth(): void {
    if (this.idleExpiresAt === null && !this.onAuthChange) return
    const had = this.idleExpiresAt !== null
    this.idleExpiresAt = null
    if (had) this.onAuthChange?.(this.getAuthSession())
  }

  private async writeHostsMac(content: string): Promise<void> {
    const hostsPath = getSystemHostsPath()
    if (this.sessionDir && this.isSessionAlive()) {
      const src = join(this.sessionDir, `payload-${randomUUID()}.txt`)
      writeFileSync(src, content, 'utf8')
      try {
        const res = await this.roundTrip(['WRITE', src, hostsPath], WRITE_TIMEOUT_MS)
        if (!res.ok) {
          // 会话失效：清掉后走 bootstrap 重授权
          this.cleanupDir()
          this.sessionDir = null
          this.clearAuth()
          await this.macBootstrapWrite(content, hostsPath)
        } else {
          this.touchAuth()
        }
      } finally {
        try {
          unlinkSync(src)
        } catch {
          // ignore
        }
      }
      return
    }
    await this.macBootstrapWrite(content, hostsPath)
  }

  /**
   * 一次授权：写 hosts + 启动 helper。
   * bootstrap.sh 内路径全部写死；用 python3 start_new_session 拉起 helper，避免 osascript 挂死。
   */
  private async macBootstrapWrite(content: string, hostsPath: string): Promise<void> {
    if (this.startLock) {
      await this.startLock
      if (this.sessionDir && this.isSessionAlive()) {
        return this.writeHostsMac(content)
      }
    }

    const run = (async () => {
      if (this.sessionDir) {
        try {
          await this.roundTrip(['SHUTDOWN'], 500)
        } catch {
          // ignore
        }
        this.cleanupDir()
      }

      const dir = join(tmpdir(), 'c-tools-hosts-session', randomUUID())
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      this.sessionDir = dir

      const payload = join(dir, 'payload.txt')
      const writeDone = join(dir, 'write-done')
      const helperPath = join(dir, 'helper.sh')
      const starterPath = join(dir, 'start_helper.py')
      const bootstrapPath = join(dir, 'bootstrap.sh')
      const ttlSec = Math.ceil(HOSTS_AUTH_SESSION_TTL_MS / 1000)

      writeFileSync(payload, content, 'utf8')
      writeFileSync(helperPath, buildMacHelperScript(), 'utf8')
      chmodSync(helperPath, 0o755)

      // 新会话拉起 helper，彻底脱离 osascript 进程树
      writeFileSync(
        starterPath,
        [
          'import subprocess, sys',
          'subprocess.Popen(',
          `  [${pyQuote('/bin/bash')}, ${pyQuote(helperPath)}, ${pyQuote(dir)}, ${pyQuote(hostsPath)}, ${pyQuote(String(ttlSec))}],`,
          '  start_new_session=True,',
          '  stdin=subprocess.DEVNULL,',
          '  stdout=subprocess.DEVNULL,',
          '  stderr=subprocess.DEVNULL,',
          ')',
          ''
        ].join('\n'),
        'utf8'
      )

      writeFileSync(
        bootstrapPath,
        [
          '#!/bin/bash',
          'set -e',
          `cp ${shQuote(payload)} ${shQuote(hostsPath)}`,
          'dscacheutil -flushcache >/dev/null 2>&1 || true',
          'killall -HUP mDNSResponder >/dev/null 2>&1 || true',
          `printf '1\\n' > ${shQuote(writeDone)}`,
          `/usr/bin/python3 ${shQuote(starterPath)}`,
          'exit 0',
          ''
        ].join('\n'),
        'utf8'
      )
      chmodSync(bootstrapPath, 0o755)

      const child = spawn(
        'osascript',
        ['-e', `do shell script ${osaQuote(bootstrapPath)} with administrator privileges`],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      )

      let stderr = ''
      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk)
      })
      let osaExit: number | null = null
      child.on('exit', (code) => {
        osaExit = code
      })

      const deadline = Date.now() + AUTH_WAIT_MS
      while (Date.now() < deadline) {
        if (existsSync(writeDone)) break
        if (osaExit !== null && osaExit !== 0 && !existsSync(writeDone)) {
          throw new Error(formatElevateError({ stderr }, '已取消授权或写入失败'))
        }
        await sleep(POLL_MS)
      }
      if (!existsSync(writeDone)) {
        throw new Error('授权写入超时，请重试')
      }

      // 本次已写入；刷新滑动窗口（helper 同时启动）
      this.touchAuth()

      // helper 应很快 ready；失败也不影响本次已写入
      const readyDeadline = Date.now() + 8_000
      while (Date.now() < readyDeadline) {
        if (this.isSessionAlive()) return
        await sleep(POLL_MS)
      }
      console.warn('[hosts] mac helper 未就绪，下次写入将再次请求授权')
      this.clearAuth()
    })()

    this.startLock = run.finally(() => {
      this.startLock = null
    })
    await this.startLock
  }

  private async writeHostsWin(content: string): Promise<void> {
    await this.ensureWinSession()
    const dir = this.sessionDir!
    const src = join(dir, `payload-${randomUUID()}.txt`)
    writeFileSync(src, content, 'utf8')
    try {
      const res = await this.roundTrip(['WRITE', src, getSystemHostsPath()], WRITE_TIMEOUT_MS)
      if (!res.ok) throw new Error(res.error)
      this.touchAuth()
    } finally {
      try {
        unlinkSync(src)
      } catch {
        // ignore
      }
    }
  }

  private async ensureWinSession(): Promise<void> {
    if (this.sessionDir && this.isSessionAlive()) return
    if (this.startLock) {
      await this.startLock
      if (this.sessionDir && this.isSessionAlive()) return
    }
    this.startLock = this.startWinSession().finally(() => {
      this.startLock = null
    })
    await this.startLock
  }

  private isSessionAlive(): boolean {
    if (!this.sessionDir) return false
    const ready = join(this.sessionDir, 'ready')
    const hb = join(this.sessionDir, 'heartbeat')
    if (!existsSync(ready) || !existsSync(hb)) return false
    try {
      const ts = Number(readFileSync(hb, 'utf8').trim())
      return Number.isFinite(ts) && Date.now() - ts < 4_000
    } catch {
      return false
    }
  }

  private async startWinSession(): Promise<void> {
    if (this.sessionDir) {
      try {
        await this.roundTrip(['SHUTDOWN'], 800)
      } catch {
        // ignore
      }
      this.cleanupDir()
    }

    const dir = join(tmpdir(), 'c-tools-hosts-session', randomUUID())
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.sessionDir = dir
    const hostsPath = getSystemHostsPath()
    const ttlSec = Math.ceil(HOSTS_AUTH_SESSION_TTL_MS / 1000)

    try {
      const helperPath = join(dir, 'helper.ps1')
      writeFileSync(helperPath, buildWinHelperScript(), 'utf8')
      const ps = [
        '$ErrorActionPreference = "Stop"',
        `$p = Start-Process -FilePath "powershell.exe" -Verb RunAs -WindowStyle Hidden -PassThru -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",${psSingle(helperPath)},${psSingle(dir)},${psSingle(hostsPath)},"${ttlSec}")`,
        'if ($null -eq $p) { exit 1 }',
        'exit 0'
      ].join('; ')
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { timeout: AUTH_WAIT_MS, windowsHide: true }
      )
      await this.waitUntilReady(30_000)
      const ping = await this.roundTrip(['PING'], 8_000)
      if (!ping.ok) throw new Error(ping.error || '提权会话启动失败')
      this.touchAuth()
    } catch (err) {
      this.cleanupDir()
      this.sessionDir = null
      this.clearAuth()
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  private async waitUntilReady(timeoutMs: number): Promise<void> {
    const dir = this.sessionDir
    if (!dir) throw new Error('无提权会话')
    const ready = join(dir, 'ready')
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (existsSync(ready) && this.isSessionAlive()) return
      await sleep(POLL_MS)
    }
    throw new Error('提权助手启动超时，请重试')
  }

  private async roundTrip(
    lines: string[],
    timeoutMs = WRITE_TIMEOUT_MS
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const dir = this.sessionDir
    if (!dir) return { ok: false, error: '无提权会话' }
    const req = join(dir, 'request')
    const res = join(dir, 'response')
    try {
      if (existsSync(res)) unlinkSync(res)
    } catch {
      // ignore
    }
    writeFileSync(req, `${lines.join('\n')}\n`, 'utf8')

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (existsSync(res)) {
        let text = ''
        try {
          text = readFileSync(res, 'utf8').trim()
          unlinkSync(res)
        } catch {
          await sleep(POLL_MS)
          continue
        }
        if (text === 'OK' || text.startsWith('OK')) return { ok: true }
        const err = text.startsWith('ERR') ? text.slice(3).trim() : text
        return { ok: false, error: err || '写入失败' }
      }
      await sleep(POLL_MS)
    }
    return { ok: false, error: '提权写入超时' }
  }

  private cleanupDir(): void {
    if (!this.sessionDir) return
    try {
      rmSync(this.sessionDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

const sharedSession = new HostsElevateSession()

export function getHostsElevateSession(): HostsElevateSession {
  return sharedSession
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

function osaQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function pyQuote(s: string): string {
  return JSON.stringify(s)
}

function psSingle(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

function formatElevateError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const stderr = String((err as { stderr?: Buffer | string }).stderr ?? '').trim()
    if (stderr) return stderr.slice(0, 200)
  }
  if (err instanceof Error && err.message) {
    if (/canceled|cancelled|-128/i.test(err.message)) return '已取消授权'
    return err.message.slice(0, 200)
  }
  return fallback
}

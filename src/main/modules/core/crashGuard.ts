/**
 * 意外退出兜底诊断：
 * - 同步追加写入 logs/diag.log（打包后无终端也能查）
 * - 捕获 JS 未处理异常、渲染/子进程崩溃
 * - 会话标记 + 心跳：SIGTRAP 等原生 abort 时下一启动可报「上次非正常退出」
 *
 * 原生 FATAL 无法被 JS 拦住，只能靠上次心跳与子进程事件缩小范围。
 */
import { app, crashReporter, type WebContents } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'

const SESSION_FILE = 'diag-session.json'
const LOG_FILE = 'diag.log'
/** 心跳间隔；过短无意义，过长不利于定位崩溃时刻 */
const HEARTBEAT_MS = 20_000
const MAX_LOG_BYTES = 2 * 1024 * 1024

interface SessionState {
  pid: number
  startedAt: string
  lastHeartbeat: string
  cleanExit: boolean
  version: string
  platform: string
}

let logDir = ''
let sessionPath = ''
let logPath = ''
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let installed = false
let quitLogged = false

/** 尽早安装（拿锁成功后、whenReady 前即可） */
export function installCrashGuard(): void {
  if (installed) return
  installed = true

  logDir = app.getPath('logs')
  sessionPath = join(logDir, SESSION_FILE)
  logPath = join(logDir, LOG_FILE)
  ensureDir(logDir)
  rotateIfTooLarge(logPath)

  // 本地 minidump，不上传
  try {
    crashReporter.start({
      submitURL: '',
      uploadToServer: false,
      compress: true,
      ignoreSystemCrashHandler: false
    })
  } catch (err) {
    writeDiag('crashReporter.start failed', err)
  }

  reportPreviousUncleanExit()
  beginSession()
  attachProcessHooks()
  attachAppHooks()

  writeDiag('session start', {
    pid: process.pid,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    execPath: process.execPath,
    logPath,
    crashDumps: safePath('crashDumps')
  })
}

/** 供主进程其它模块写面包屑（尽量少、关键事件） */
export function writeDiag(event: string, detail?: unknown): void {
  const line = formatLine(event, detail)
  try {
    if (logPath) appendFileSync(logPath, line, 'utf-8')
  } catch {
    /* 磁盘满等忽略，避免二次崩溃 */
  }
  console.error(`[diag] ${event}`, detail ?? '')
}

function attachProcessHooks(): void {
  process.on('uncaughtException', (err) => {
    writeDiag('uncaughtException', serializeError(err))
  })
  process.on('unhandledRejection', (reason) => {
    writeDiag('unhandledRejection', serializeError(reason))
  })
  process.on('warning', (warning) => {
    writeDiag('process.warning', serializeError(warning))
  })
}

function attachAppHooks(): void {
  app.on('render-process-gone', (_event, webContents, details) => {
    writeDiag('render-process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      url: safeUrl(webContents),
      title: safeTitle(webContents)
    })
  })

  app.on('child-process-gone', (_event, details) => {
    writeDiag('child-process-gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name
    })
  })

  // 正常退出路径打标；SIGTRAP 通常走不到这里
  app.on('before-quit', () => {
    if (quitLogged) return
    quitLogged = true
    writeDiag('before-quit')
    markCleanExit()
  })
  app.on('will-quit', () => {
    writeDiag('will-quit')
    markCleanExit()
    stopHeartbeat()
  })
  app.on('quit', (_e, exitCode) => {
    writeDiag('quit', { exitCode })
  })
}

function reportPreviousUncleanExit(): void {
  const prev = readSession()
  if (!prev) return
  if (prev.cleanExit) {
    writeDiag('previous session clean exit', {
      pid: prev.pid,
      startedAt: prev.startedAt,
      lastHeartbeat: prev.lastHeartbeat
    })
    return
  }
  writeDiag('PREVIOUS SESSION UNCLEAN EXIT', {
    pid: prev.pid,
    startedAt: prev.startedAt,
    lastHeartbeat: prev.lastHeartbeat,
    version: prev.version,
    platform: prev.platform,
    hint: '可能是原生 SIGTRAP/强制结束；对照 lastHeartbeat 与本文件更早条目'
  })
}

function beginSession(): void {
  const now = new Date().toISOString()
  const state: SessionState = {
    pid: process.pid,
    startedAt: now,
    lastHeartbeat: now,
    cleanExit: false,
    version: app.getVersion(),
    platform: `${process.platform}-${process.arch}`
  }
  writeSession(state)
  stopHeartbeat()
  heartbeatTimer = setInterval(() => {
    const cur = readSession()
    if (!cur || cur.pid !== process.pid) return
    cur.lastHeartbeat = new Date().toISOString()
    writeSession(cur)
  }, HEARTBEAT_MS)
  // 不阻止进程退出
  heartbeatTimer.unref?.()
}

function markCleanExit(): void {
  const cur = readSession()
  if (!cur || cur.pid !== process.pid) return
  cur.cleanExit = true
  cur.lastHeartbeat = new Date().toISOString()
  writeSession(cur)
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function readSession(): SessionState | null {
  try {
    if (!existsSync(sessionPath)) return null
    return JSON.parse(readFileSync(sessionPath, 'utf-8')) as SessionState
  } catch {
    return null
  }
}

function writeSession(state: SessionState): void {
  try {
    writeFileSync(sessionPath, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    console.error('[diag] write session failed', err)
  }
}

function formatLine(event: string, detail?: unknown): string {
  const ts = new Date().toISOString()
  let body = ''
  if (detail !== undefined) {
    try {
      body = ' ' + JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? String(v) : v))
    } catch {
      body = ' ' + String(detail)
    }
  }
  return `[${ts}] ${event}${body}\n`
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack }
  }
  if (typeof err === 'string') return err
  try {
    return JSON.parse(JSON.stringify(err))
  } catch {
    return String(err)
  }
}

function safeUrl(wc: WebContents): string {
  try {
    return wc.isDestroyed() ? '[destroyed]' : wc.getURL()
  } catch {
    return '[unavailable]'
  }
}

function safeTitle(wc: WebContents): string {
  try {
    return wc.isDestroyed() ? '[destroyed]' : wc.getTitle()
  } catch {
    return '[unavailable]'
  }
}

function safePath(name: Parameters<typeof app.getPath>[0]): string {
  try {
    return app.getPath(name)
  } catch {
    return ''
  }
}

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
}

/** 简单轮转：超限则改名为 .old 再开新文件 */
function rotateIfTooLarge(file: string): void {
  try {
    if (!existsSync(file)) return
    const { size } = statSync(file)
    if (size < MAX_LOG_BYTES) return
    const bak = `${file}.old`
    try {
      writeFileSync(bak, readFileSync(file))
    } catch {
      /* ignore */
    }
    writeFileSync(file, '')
  } catch {
    /* ignore */
  }
}

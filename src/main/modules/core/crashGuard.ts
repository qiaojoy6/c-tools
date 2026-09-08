/**
 * 意外退出兜底诊断：
 * - 同步追加写入 logs/diag.log（打包后无终端也能查）
 * - 捕获 JS 未处理异常、渲染/子进程崩溃
 * - 会话标记 + 心跳：SIGTRAP 等原生 abort 时下一启动可报「上次非正常退出」
 * - 单行截断 + 写时/启动轮转，避免长会话把日志撑到数 GB
 *
 * 原生 FATAL 无法被 JS 拦住，只能靠上次心跳与子进程事件缩小范围。
 */
import { app, crashReporter, type WebContents } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'

const SESSION_FILE = 'diag-session.json'
const LOG_FILE = 'diag.log'
/** 心跳间隔；过短无意义，过长不利于定位崩溃时刻 */
const HEARTBEAT_MS = 20_000
/** 当前日志上限；超限轮转为 .old（仅保留一份） */
const MAX_LOG_BYTES = 2 * 1024 * 1024
/** 单行 detail 上限，避免一次 JSON.stringify 巨大对象撑爆磁盘 */
const MAX_LINE_BYTES = 8 * 1024

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
/** 当前 diag.log 近似字节数，写时累加，轮转后归零 */
let logBytesApprox = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let installed = false
let quitLogged = false
/** 防止 writeDiag / uncaughtException 互相重入（如 console.error 抛 EIO） */
let writingDiag = false

/** 尽早安装（拿锁成功后、whenReady 前即可） */
export function installCrashGuard(): void {
  if (installed) return
  installed = true

  logDir = app.getPath('logs')
  sessionPath = join(logDir, SESSION_FILE)
  logPath = join(logDir, LOG_FILE)
  ensureDir(logDir)
  logBytesApprox = safeFileSize(logPath)
  rotateIfTooLarge()

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
  if (writingDiag) return
  writingDiag = true
  try {
    const line = formatLine(event, detail)
    const lineBytes = Buffer.byteLength(line, 'utf-8')
    try {
      if (logPath) {
        // 运行中也限长：仅启动时轮转会在长会话里无限涨到数 GB
        if (logBytesApprox + lineBytes > MAX_LOG_BYTES) {
          rotateIfTooLarge(true)
        }
        appendFileSync(logPath, line, 'utf-8')
        logBytesApprox += lineBytes
      }
    } catch {
      /* 磁盘满等忽略，避免二次崩溃 */
    }
    // 控制台可能已断开（EIO/EPIPE）；绝不可再抛成 uncaughtException
    try {
      console.error(`[diag] ${event}`, detail ?? '')
    } catch {
      /* ignore broken stdout/stderr */
    }
  } finally {
    writingDiag = false
  }
}

/** stdout/stderr 断开时的噪音，记一次即可，不当成致命逻辑错误 */
function isBrokenPipeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const msg = 'message' in err ? String((err as { message?: unknown }).message) : ''
  const code = 'code' in err ? String((err as { code?: unknown }).code) : ''
  return (
    code === 'EIO' ||
    code === 'EPIPE' ||
    /write EIO/i.test(msg) ||
    /write EPIPE/i.test(msg)
  )
}

function attachProcessHooks(): void {
  process.on('uncaughtException', (err) => {
    // 断管导致的 write 失败：只落盘一次，避免与 console.error 死循环拖死进程
    if (isBrokenPipeError(err)) {
      writeDiag('uncaughtException.broken-pipe', serializeError(err))
      return
    }
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
  } catch {
    /* 会话文件写失败不打 console，避免断管时再炸 */
  }
}

function formatLine(event: string, detail?: unknown): string {
  const ts = new Date().toISOString()
  let body = ''
  if (detail !== undefined) {
    try {
      if (typeof detail === 'string') {
        body = ' ' + clipStr(detail, MAX_LINE_BYTES)
      } else {
        body =
          ' ' +
          JSON.stringify(detail, (_k, v) => {
            if (typeof v === 'bigint') return String(v)
            // Buffer / TypedArray 只记长度，避免二进制整段落盘
            if (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) {
              return `[Buffer length=${v.length}]`
            }
            if (ArrayBuffer.isView(v)) {
              return `[${v.constructor.name} length=${v.byteLength}]`
            }
            if (typeof v === 'string' && v.length > 2_000) return clipStr(v, 2_000)
            return v
          })
      }
    } catch {
      body = ' ' + clipStr(String(detail), MAX_LINE_BYTES)
    }
  }
  // 整行超限截断（按字符近似；诊断日志以 ASCII 为主）
  const head = `[${ts}] ${event}`
  const maxBody = Math.max(0, MAX_LINE_BYTES - head.length - 16)
  if (body.length > maxBody) {
    body = `${body.slice(0, maxBody)}…[truncated]`
  }
  return `${head}${body}\n`
}

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: clipStr(err.message, 2_000),
      stack: clipStr(err.stack ?? '', 4_000)
    }
  }
  if (typeof err === 'string') return clipStr(err, 2_000)
  try {
    const raw = JSON.stringify(err)
    if (raw.length > MAX_LINE_BYTES) {
      return { truncated: true, preview: raw.slice(0, 2_000) }
    }
    return JSON.parse(raw)
  } catch {
    return clipStr(String(err), 2_000)
  }
}

function clipStr(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…[truncated]`
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

function safeFileSize(file: string): number {
  try {
    if (!existsSync(file)) return 0
    return statSync(file).size
  } catch {
    return 0
  }
}

/**
 * 超限轮转：rename 为 .old（不整文件读入内存，避免曾膨胀到数 GB 时 OOM / 再写一份巨文件）。
 * 已有 .old 则先删；若当前文件已远超上限则直接丢弃，不留巨型 .old。
 * @param force 写前预测即将超限时强制轮转（即使当前略低于阈值）
 */
function rotateIfTooLarge(force = false): void {
  if (!logPath) return
  try {
    const size = safeFileSize(logPath)
    logBytesApprox = size
    if (!force && size < MAX_LOG_BYTES) return
    if (force && size === 0) {
      logBytesApprox = 0
      return
    }

    const bak = `${logPath}.old`
    try {
      if (existsSync(bak)) unlinkSync(bak)
    } catch {
      /* ignore */
    }

    // 已病理膨胀：只清当前文件，不 rename 成数 GB 的 .old
    if (size > MAX_LOG_BYTES * 2) {
      try {
        unlinkSync(logPath)
      } catch {
        try {
          writeFileSync(logPath, '')
        } catch {
          /* ignore */
        }
      }
      logBytesApprox = 0
      return
    }

    try {
      renameSync(logPath, bak)
    } catch {
      // rename 失败（跨盘等）时直接清空，绝不 readFileSync 整文件
      try {
        writeFileSync(logPath, '')
      } catch {
        /* ignore */
      }
    }
    logBytesApprox = 0
  } catch {
    /* ignore */
  }
}

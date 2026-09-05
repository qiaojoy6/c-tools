/**
 * 渲染进程日志工具
 * - 先 format（循环引用 / Error / Map / DOM…）再经 api.logWrite 打到主进程终端
 * - DevTools 仍打印原始参数，便于展开查看
 * - 不覆盖 contextBridge 属性：传输走 api.logWrite；window.logApi 仅在可挂载时安装
 */
import { formatLogArgs } from '@shared/logFormat'
import type { LogApi, LogLevel } from '@shared/types'

function writeToMain(level: LogLevel, messages: string[]): void {
  window.api.logWrite(level, messages)
}

function emit(level: LogLevel, args: unknown[]): void {
  const messages = formatLogArgs(args)
  const cons =
    level === 'debug'
      ? console.debug
      : level === 'info'
        ? console.info
        : level === 'warn'
          ? console.warn
          : console.error
  cons(...args)
  writeToMain(level, messages)
}

/**
 * 可 import 使用（推荐；不依赖 window 挂载）
 *
 * @example
 * import { logApi } from '@renderer/utils/logApi'
 * logApi.info('hello', { a: 1 }, err)
 */
export const logApi: LogApi = {
  write: writeToMain,
  debug: (...args) => emit('debug', args),
  info: (...args) => emit('info', args),
  warn: (...args) => emit('warn', args),
  error: (...args) => emit('error', args)
}

/**
 * 尝试挂到 window.logApi。
 * contextBridge 若曾占用同名只读属性则跳过（仍可用 import { logApi }）。
 */
export function installLogApi(): void {
  const desc = Object.getOwnPropertyDescriptor(window, 'logApi')
  if (desc && !desc.configurable) return

  try {
    Object.defineProperty(window, 'logApi', {
      value: logApi,
      writable: false,
      configurable: true,
      enumerable: true
    })
  } catch {
    /* 只读 / 不可重定义时忽略 */
  }
}

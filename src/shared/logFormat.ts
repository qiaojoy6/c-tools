/**
 * 日志值安全格式化：处理循环引用、特殊引用类型，产出可 JSON 化的结构。
 * 必须在渲染进程、过 contextBridge 之前调用。
 */

const CIRCULAR = '[Circular]'
const MAX_DEPTH = 8
const MAX_ARRAY_LEN = 100
const MAX_OBJECT_KEYS = 50
const MAX_STRING_LEN = 4000
const MAX_TYPED_PREVIEW = 32

/** 把单个值转成可 JSON.stringify 的形态 */
export function formatLogValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): unknown {
  if (value === null) return null
  if (value === undefined) return '[undefined]'

  const t = typeof value
  if (t === 'string') {
    const s = value as string
    return s.length > MAX_STRING_LEN
      ? `${s.slice(0, MAX_STRING_LEN)}…(+${s.length - MAX_STRING_LEN})`
      : s
  }
  if (t === 'number') {
    const n = value as number
    return Number.isNaN(n) ? '[NaN]' : n === Infinity ? '[Infinity]' : n === -Infinity ? '[-Infinity]' : n
  }
  if (t === 'boolean') return value
  if (t === 'bigint') return `${value as bigint}n`
  if (t === 'symbol') return (value as symbol).toString()
  if (t === 'function') {
    const name = (value as { name?: string }).name
    return `[Function ${name || 'anonymous'}]`
  }

  if (t !== 'object') return String(value)

  const obj = value as object
  if (seen.has(obj)) return CIRCULAR

  // Error（含自定义子类）
  if (value instanceof Error) {
    return {
      __type: value.name || 'Error',
      message: value.message,
      stack: value.stack
    }
  }
  if (value instanceof Date) return value.toISOString()
  if (value instanceof RegExp) return value.toString()

  // Promise 不可同步展开
  if (typeof Promise !== 'undefined' && value instanceof Promise) {
    return '[Promise]'
  }

  if (value instanceof Map) {
    seen.add(obj)
    if (depth >= MAX_DEPTH) return '[Map MaxDepth]'
    const entries: unknown[] = []
    let i = 0
    for (const [k, v] of value) {
      if (i >= MAX_ARRAY_LEN) {
        entries.push(`…+${value.size - MAX_ARRAY_LEN} more`)
        break
      }
      entries.push([formatLogValue(k, seen, depth + 1), formatLogValue(v, seen, depth + 1)])
      i++
    }
    return { __type: 'Map', size: value.size, entries }
  }

  if (value instanceof Set) {
    seen.add(obj)
    if (depth >= MAX_DEPTH) return '[Set MaxDepth]'
    const values: unknown[] = []
    let i = 0
    for (const v of value) {
      if (i >= MAX_ARRAY_LEN) {
        values.push(`…+${value.size - MAX_ARRAY_LEN} more`)
        break
      }
      values.push(formatLogValue(v, seen, depth + 1))
      i++
    }
    return { __type: 'Set', size: value.size, values }
  }

  if (value instanceof WeakMap) return '[WeakMap]'
  if (value instanceof WeakSet) return '[WeakSet]'

  // ArrayBuffer / TypedArray
  if (value instanceof ArrayBuffer) {
    return { __type: 'ArrayBuffer', byteLength: value.byteLength }
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView & { length?: number }
    const len = 'length' in view && typeof view.length === 'number' ? view.length : view.byteLength
    const preview: number[] = []
    if ('length' in view && typeof view.length === 'number') {
      const n = Math.min(view.length, MAX_TYPED_PREVIEW)
      for (let i = 0; i < n; i++) preview.push(Number((view as unknown as ArrayLike<number>)[i]))
    }
    return {
      __type: value.constructor?.name || 'TypedArray',
      length: len,
      byteLength: view.byteLength,
      preview: preview.length
        ? preview.length < (view as { length: number }).length
          ? [...preview, `…+${(view as { length: number }).length - preview.length}`]
          : preview
        : undefined
    }
  }

  // DOM（渲染进程）
  if (typeof Element !== 'undefined' && value instanceof Element) {
    const id = value.id ? `#${value.id}` : ''
    const cls =
      typeof value.className === 'string' && value.className
        ? `.${value.className.trim().split(/\s+/).join('.')}`
        : ''
    return `[${value.tagName}${id}${cls}]`
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return `[${value.nodeName}]`
  }

  if (depth >= MAX_DEPTH) {
    const name = (obj as { constructor?: { name?: string } }).constructor?.name
    return `[MaxDepth${name && name !== 'Object' ? ` ${name}` : ''}]`
  }

  seen.add(obj)

  if (Array.isArray(value)) {
    const out: unknown[] = []
    const n = Math.min(value.length, MAX_ARRAY_LEN)
    for (let i = 0; i < n; i++) {
      out.push(formatLogValue(value[i], seen, depth + 1))
    }
    if (value.length > MAX_ARRAY_LEN) {
      out.push(`…+${value.length - MAX_ARRAY_LEN} more`)
    }
    return out
  }

  // 支持自定义 toJSON（如 Vue 部分对象）
  const maybeJson = value as { toJSON?: () => unknown }
  if (typeof maybeJson.toJSON === 'function') {
    try {
      return formatLogValue(maybeJson.toJSON(), seen, depth)
    } catch {
      /* fall through */
    }
  }

  const ctor = (obj as { constructor?: { name?: string } }).constructor?.name
  const out: Record<string, unknown> = {}
  if (ctor && ctor !== 'Object') out.__type = ctor

  let keys: string[]
  try {
    keys = Reflect.ownKeys(obj).filter((k): k is string => typeof k === 'string')
  } catch {
    return { __type: ctor || 'Object', __error: '[keys inaccessible]' }
  }

  const limited = keys.slice(0, MAX_OBJECT_KEYS)
  for (const key of limited) {
    try {
      out[key] = formatLogValue((obj as Record<string, unknown>)[key], seen, depth + 1)
    } catch (err) {
      out[key] = `[Throw: ${err instanceof Error ? err.message : String(err)}]`
    }
  }
  if (keys.length > MAX_OBJECT_KEYS) {
    out.__moreKeys = keys.length - MAX_OBJECT_KEYS
  }
  return out
}

/** 将若干参数格式化为可 IPC 传递的字符串列表 */
export function formatLogArgs(args: unknown[]): string[] {
  return args.map((arg) => {
    if (typeof arg === 'string') return arg
    try {
      const formatted = formatLogValue(arg)
      if (typeof formatted === 'string') return formatted
      return JSON.stringify(formatted)
    } catch (err) {
      return `[Unserializable: ${err instanceof Error ? err.message : String(err)}]`
    }
  })
}

/** 系统 hosts 中 c-tools 方案围栏（匹配只认 id） */

const BEGIN_RE = /^# ===== c-tools:([^\s=]+) =====\s*$/
const END_PREFIX = '# ===== /c-tools:'

/** 生成某方案的 BEGIN / END 行 */
export function markerBegin(id: string): string {
  return `# ===== c-tools:${id} =====`
}

export function markerEnd(id: string): string {
  return `# ===== /c-tools:${id} =====`
}

export type HostsBlock = {
  id: string
  /** 块内正文（不含标记行） */
  body: string
  startLine: number
  endLine: number
}

/** 扫描文件中全部 c-tools 标记块 */
export function findAllBlocks(text: string): HostsBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: HostsBlock[] = []
  let i = 0
  while (i < lines.length) {
    const begin = BEGIN_RE.exec(lines[i] ?? '')
    if (!begin) {
      i += 1
      continue
    }
    const id = begin[1]!
    const startLine = i
    i += 1
    const bodyLines: string[] = []
    let foundEnd = false
    while (i < lines.length) {
      const line = lines[i]!
      if (line === markerEnd(id) || line.startsWith(`${END_PREFIX}${id}`)) {
        foundEnd = true
        break
      }
      // 遇到下一个 BEGIN 则视为残缺块结束
      if (BEGIN_RE.test(line)) break
      bodyLines.push(line)
      i += 1
    }
    const endLine = foundEnd ? i : i - 1
    blocks.push({
      id,
      body: bodyLines.join('\n'),
      startLine,
      endLine: foundEnd ? endLine : Math.max(startLine, endLine)
    })
    i = foundEnd ? endLine + 1 : i
  }
  return blocks
}

/**
 * 去掉全部 c-tools 标记块，保留块外内容；末尾整理多余空行。
 */
export function stripAllCtoolsBlocks(text: string): string {
  const lines = text.split(/\r?\n/)
  const blocks = findAllBlocks(text)
  if (blocks.length === 0) return text.replace(/\s+$/, '') + (text.endsWith('\n') ? '\n' : '')

  const remove = new Set<number>()
  for (const b of blocks) {
    for (let i = b.startLine; i <= b.endLine; i++) remove.add(i)
  }
  const kept = lines.filter((_, idx) => !remove.has(idx))
  // 去掉末尾空行后再由调用方拼接
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === '') kept.pop()
  return kept.join('\n')
}

/** 用平台换行拼一段标记块 */
export function formatBlock(id: string, body: string, eol: string): string {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const inner = normalized.replace(/^\n+/, '').replace(/\n+$/, '')
  const parts = [markerBegin(id)]
  if (inner) parts.push(inner)
  parts.push(markerEnd(id))
  return parts.join(eol)
}

/**
 * 在「去掉全部 c-tools 块」后的基底上，按顺序追加启用方案。
 */
export function rebuildWithSchemes(
  originalText: string,
  schemes: Array<{ id: string; content: string }>,
  eol: string
): string {
  let base = stripAllCtoolsBlocks(originalText)
  base = base.replace(/\s+$/, '')
  const chunks: string[] = []
  if (base) chunks.push(base)
  for (const s of schemes) {
    chunks.push(formatBlock(s.id, s.content, eol))
  }
  if (chunks.length === 0) return eol === '\r\n' ? '\r\n' : '\n'
  return chunks.join(eol + eol) + eol
}

/** 检测原文件换行符 */
export function detectEol(text: string): '\n' | '\r\n' {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

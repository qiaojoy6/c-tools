import { pinyin } from 'pinyin-pro'

/**
 * 文本搜索：原文包含（忽略大小写）或拼音命中。
 *
 * 拼音用整句转写（按语境定多音字），再按「连续汉字 + 单字拼音前缀」匹配：
 * - 每个字消耗查询里一段该字拼音的前缀（可只打 j / jian，不可跳字母）
 * - 命中字必须相连，不能跳字
 * - 「极速版为什么…」里「什」按语境是 shen，输入 shi 不再命中
 */
export function textMatchesQuery(text: string, query: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (text.toLowerCase().includes(q.toLowerCase())) return true

  const pinyinQuery = q.toLowerCase().replace(/\s+/g, '')
  if (!/^[a-z]+$/.test(pinyinQuery)) return false

  try {
    const syllables = pinyin(text, {
      toneType: 'none',
      type: 'array',
      v: true
    }) as string[]
    return pinyinSyllablesMatch(syllables, pinyinQuery)
  } catch {
    return false
  }
}

/** 从某一音节起，用查询串按前缀连续吃掉若干音节 */
function pinyinSyllablesMatch(syllables: string[], query: string): boolean {
  for (let start = 0; start < syllables.length; start++) {
    if (matchFrom(syllables, start, 0, query)) return true
  }
  return false
}

function matchFrom(
  syllables: string[],
  syllableIndex: number,
  queryIndex: number,
  query: string
): boolean {
  if (queryIndex === query.length) return true
  if (syllableIndex >= syllables.length) return false

  const raw = syllables[syllableIndex] ?? ''
  const syl = raw.toLowerCase().replace(/ü/g, 'v')

  // 非拼音音节（标点、空格等）：跳过，不消耗查询
  if (!/^[a-z]+$/.test(syl)) {
    return matchFrom(syllables, syllableIndex + 1, queryIndex, query)
  }

  // 查询在该字上能匹配的最长前缀长度
  let maxLen = 0
  while (
    maxLen < syl.length &&
    queryIndex + maxLen < query.length &&
    syl[maxLen] === query[queryIndex + maxLen]
  ) {
    maxLen++
  }
  if (maxLen === 0) return false

  // 从长到短尝试切分（兼顾 nihao / nh 等）
  for (let len = maxLen; len >= 1; len--) {
    if (matchFrom(syllables, syllableIndex + 1, queryIndex + len, query)) return true
  }
  return false
}

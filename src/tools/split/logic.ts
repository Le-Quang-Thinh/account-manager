import { dedupeLines, normalizeLine, splitLines, toText } from '../../shared/lib/lines'

// ----- Tỉa file (workspace) -----
export type TrimAction = 'empty' | 'dupe' | 'remove_kw' | 'keep_kw'
export function trimText(text: string, action: TrimAction, keyword: string, caseSensitive: boolean) {
  let lines = splitLines(text)
  if (action === 'empty') lines = lines.filter(l => l.trim() !== '')
  else if (action === 'dupe') lines = dedupeLines(lines, caseSensitive)
  else if (keyword) {
    const kw = normalizeLine(keyword, caseSensitive)
    const has = (l: string) => normalizeLine(l, caseSensitive).includes(kw)
    lines = lines.filter(l => action === 'remove_kw' ? !has(l) : has(l))
  }
  return toText(lines)
}

// ----- Chia lô để copy -----
export function makeBatches(text: string, batchSize: number) {
  if (!text) return []
  const lines = splitLines(text)
  const size = Math.max(1, batchSize)
  const batches: { id: number; content: string; count: number }[] = []
  for (let i = 0; i < lines.length; i += size) {
    const chunk = lines.slice(i, i + size)
    batches.push({ id: Math.floor(i / size) + 1, content: toText(chunk), count: chunk.length })
  }
  return batches
}

// ----- Tách Special: lọc theo từ khoá / regex -----
export function filterByKeyword(raw: string, keyword: string, isRegex: boolean, caseSensitive: boolean, dedupe: boolean) {
  const empty = { result: '', remaining: '', total: 0, matched: 0, remainingCount: 0, error: '' }
  if (!raw) return empty
  const lines = splitLines(raw)
  if (!keyword) {
    const out = dedupe ? dedupeLines(lines, caseSensitive) : lines
    return { ...empty, result: toText(out), total: lines.length, matched: out.length }
  }
  let matched: string[] = []
  let unmatched: string[] = []
  try {
    const regex = isRegex ? new RegExp(keyword, caseSensitive ? '' : 'i') : null
    const kw = normalizeLine(keyword, caseSensitive)
    for (const line of lines) {
      const hit = regex ? regex.test(line) : normalizeLine(line, caseSensitive).includes(kw)
      ;(hit ? matched : unmatched).push(line)
    }
  } catch (err) {
    return { ...empty, remaining: toText(lines), total: lines.length, remainingCount: lines.length, error: (err as Error).message }
  }
  if (dedupe) {
    matched = dedupeLines(matched, caseSensitive)
    unmatched = dedupeLines(unmatched, caseSensitive)
  }
  return { result: toText(matched), remaining: toText(unmatched), total: lines.length, matched: matched.length, remainingCount: unmatched.length, error: '' }
}

// Cắt văn bản thành các đoạn (đoạn trúng từ khoá có hit = true) để tô sáng
export interface Segment { text: string; hit: boolean }
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
export function highlightSegments(text: string, keyword: string, isRegex: boolean, caseSensitive: boolean): Segment[] {
  if (!text) return []
  if (!keyword || (isRegex && ['^', '$', '\\b'].includes(keyword))) return [{ text, hit: false }]
  try {
    const src = isRegex ? keyword : keyword.replace(ESCAPE_RE, '\\$&')
    const regex = new RegExp(src, caseSensitive ? 'g' : 'gi')
    const out: Segment[] = []
    let last = 0
    let guard = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(text)) !== null) {
      if (++guard > 50000) break
      if (m[0].length === 0) { regex.lastIndex++; continue }
      if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false })
      out.push({ text: m[0], hit: true })
      last = m.index + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last), hit: false })
    return out
  } catch (e) {
    return [{ text, hit: false }]
  }
}

// ----- Tách file (Split) -----
export type SplitMethod = 'by_files' | 'by_lines'
export function splitIntoChunks(raw: string, opts: { dedupe: boolean; method: SplitMethod; num: number; multiple: number; caseSensitive: boolean }) {
  if (!raw) return { chunks: [] as string[][], total: 0, afterDedupe: 0 }
  let lines = splitLines(raw)
  const total = lines.length
  if (opts.dedupe) lines = dedupeLines(lines, opts.caseSensitive)
  const afterDedupe = lines.length
  const chunks: string[][] = []
  const num = Math.max(1, opts.num)
  if (opts.method === 'by_files') {
    const m = Math.max(1, opts.multiple)
    let size = Math.ceil(lines.length / num)
    if (m > 1) size = Math.round(lines.length / num / m) * m || m
    let idx = 0
    for (let i = 0; i < num - 1 && idx < lines.length; i++) {
      chunks.push(lines.slice(idx, idx + size))
      idx += size
    }
    if (idx < lines.length) chunks.push(lines.slice(idx))
  } else {
    for (let i = 0; i < lines.length; i += num) chunks.push(lines.slice(i, i + num))
  }
  return { chunks, total, afterDedupe }
}

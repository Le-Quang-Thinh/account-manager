// Xử lý theo dòng, dùng chung cho mọi công cụ.

export const splitLines = (text: string) => text.split(/\r?\n/)
export const toText = (lines: string[]) => lines.join('\n')
export const normalizeLine = (line: string, caseSensitive: boolean) => caseSensitive ? line : line.toLowerCase()
export const parseIntOr = (value: string | number, fallback = 1) => parseInt(String(value), 10) || fallback
export const countLines = (text: string) => text ? splitLines(text).length : 0
export const countFilled = (text: string) => text ? splitLines(text).filter(l => l.trim()).length : 0

export function dedupeLines(lines: string[], caseSensitive = true) {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const key = normalizeLine(line, caseSensitive)
    if (!seen.has(key)) { seen.add(key); unique.push(line) }
  }
  return unique
}

export function uniqueAndDuplicateLines(lines: string[], caseSensitive: boolean) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const key = normalizeLine(line, caseSensitive)
    if (seen.has(key)) duplicates.add(line)
    else { seen.add(key); unique.push(line) }
  }
  return { unique, duplicates }
}

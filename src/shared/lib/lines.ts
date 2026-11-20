// Xử lý theo dòng, dùng chung cho mọi công cụ.

export const splitLines = (text: string) => text.split(/\r?\n/)
export const toText = (lines: string[]) => lines.join('\n')
export const normalizeLine = (line: string, caseSensitive: boolean) => caseSensitive ? line : line.toLowerCase()

// Lấy phần username của một dòng account (phần trước dấu ":"). vd "aaa:gameol" -> "aaa".
// Không có ":" thì giữ nguyên cả dòng.
export const usernamePart = (line: string) => {
  const i = line.indexOf(':')
  return i === -1 ? line : line.slice(0, i)
}

// Khoá dùng để so trùng một dòng: userOnly = true thì chỉ so theo username (bỏ phần pass).
export const lineKey = (line: string, caseSensitive: boolean, userOnly = false) =>
  normalizeLine(userOnly ? usernamePart(line).trim() : line, caseSensitive)
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

export function uniqueAndDuplicateLines(lines: string[], caseSensitive: boolean, userOnly = false) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const unique: string[] = []
  for (const line of lines) {
    const key = lineKey(line, caseSensitive, userOnly)
    if (seen.has(key)) duplicates.add(line)
    else { seen.add(key); unique.push(line) }
  }
  return { unique, duplicates }
}

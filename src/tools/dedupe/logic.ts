import { lineKey, splitLines, toText, uniqueAndDuplicateLines } from '../../shared/lib/lines'

// Lọc trùng File 1; nếu có File 2 thì so sánh hai file.
// userOnly = true: chỉ so trùng theo username (phần trước dấu ":"), bỏ phần pass.
export function compareFiles(textA: string, textB: string, caseSensitive: boolean, userOnly = false) {
  const linesA = textA ? splitLines(textA) : []
  const linesB = textB ? splitLines(textB) : []
  const key = (v: string) => lineKey(v, caseSensitive, userOnly)
  const keysA = new Set(linesA.map(key))
  const keysB = new Set(linesB.map(key))
  const { unique: uniqA, duplicates: dupesA } = uniqueAndDuplicateLines(linesA, caseSensitive, userOnly)
  const { unique: uniqB, duplicates: dupesB } = uniqueAndDuplicateLines(linesB, caseSensitive, userOnly)
  const onlyA = uniqA.filter(l => !keysB.has(key(l)))
  const onlyB = uniqB.filter(l => !keysA.has(key(l)))
  const both = uniqA.filter(l => keysB.has(key(l)))
  return {
    duplicateA: toText([...dupesA]),
    duplicateB: toText([...dupesB]),
    onlyA: toText(onlyA),
    onlyB: toText(onlyB),
    both: toText(both),
    stats: { a: linesA.length, b: linesB.length, dupesA: dupesA.size, dupesB: dupesB.size, onlyA: onlyA.length, onlyB: onlyB.length, both: both.length },
  }
}

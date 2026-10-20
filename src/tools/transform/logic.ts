import { splitLines, toText } from '../../shared/lib/lines'

// ----- Trộn xen kẽ A / B -----
export function mixLines(textA: string, textB: string, countA: number, countB: number) {
  const linesA = textA ? splitLines(textA) : []
  const linesB = textB ? splitLines(textB) : []
  const a = Math.max(1, countA)
  const b = Math.max(1, countB)
  const out: string[] = []
  let iA = 0
  let iB = 0
  while (iA < linesA.length || iB < linesB.length) {
    for (let n = 0; n < a && iA < linesA.length; n++, iA++) out.push(linesA[iA])
    for (let n = 0; n < b && iB < linesB.length; n++, iB++) out.push(linesB[iB])
  }
  return { result: toText(out), stats: { a: linesA.length, b: linesB.length, out: out.length } }
}

// ----- Tách dính liền: "userAGamepika238@userBGamepika238@" -> "userA:Gamepika238@" -----
export function splitGlued(raw: string, delimiter: string, separator: string) {
  if (!raw) return ''
  if (!delimiter) return raw
  return toText(raw.split(delimiter)
    .map(part => part.trim().replace(/\r?\n/g, '').trim())
    .filter(Boolean)
    .map(user => `${user}${separator}${delimiter}`))
}

// ----- Trích xuất cột -----
export function extractColumns(raw: string, delimiter: string, keep: string, outSeparator: string) {
  if (!raw) return ''
  const delim = delimiter === '\\t' ? '\t' : (delimiter || '\t')
  const outSep = outSeparator === '\\t' ? '\t' : outSeparator
  const indices = keep.split(',').map(n => parseInt(n.trim(), 10) - 1).filter(n => Number.isInteger(n) && n >= 0)
  return toText(splitLines(raw).filter(line => line.trim()).map(line => {
    const parts = line.split(delim)
    return indices.map(i => parts[i] !== undefined ? parts[i].trim() : '').join(outSep)
  }))
}

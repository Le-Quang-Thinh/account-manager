// Note event: dữ liệu và gộp khi nhiều người sửa cùng lúc. Không phụ thuộc React.
import { countFilled } from '../../shared/lib/lines'

// Mỗi lần upload / nhập là một mục có ghi chú riêng, vd. 20 dòng "note A", 40 dòng "note B"
export interface Entry { id: string; note: string; text: string }
export interface Member { id: string; name: string; entries: Entry[] }
export interface EventNote { id: string; name: string; members: Member[] }

let seq = 0
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2)}`

export const entryTotal = (e: Entry) => countFilled(e.text)
export const memberTotal = (m: Member) => m.entries.reduce((t, e) => t + entryTotal(e), 0)
export const eventTotal = (e: EventNote) => e.members.reduce((t, m) => t + memberTotal(m), 0)

// Tổng dòng theo ghi chú (không phân biệt hoa thường) trong cả event
export function noteTotals(ev: EventNote) {
  const map = new Map<string, { note: string; n: number }>()
  for (const m of ev.members) for (const e of m.entries) {
    const n = entryTotal(e)
    if (!n) continue
    const key = e.note.trim().toLowerCase()
    const cur = map.get(key)
    if (cur) cur.n += n; else map.set(key, { note: e.note.trim() || '(chưa ghi chú)', n })
  }
  return [...map.values()]
}

// Dữ liệu cũ lưu text trực tiếp trong member -> chuyển thành 1 mục không có ghi chú
export const normalizeEvents = (events: EventNote[]): EventNote[] => events.map(ev => ({
  ...ev,
  members: ev.members.map(m => {
    const legacy = (m as Member & { text?: string }).text
    if (Array.isArray(m.entries)) return m
    return { id: m.id, name: m.name, entries: legacy ? [{ id: newId(), note: '', text: legacy }] : [] }
  }),
}))

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Gộp 3 bên theo id: base (bản đã đồng bộ lần cuối), local (đang sửa), remote (trên server).
// Mục nào bên mình đã sửa thì giữ bản của mình, không thì lấy bản server; xóa ở bên nào cũng được tôn trọng.
function mergeList<T extends { id: string }>(base: T[], local: T[], remote: T[], mergeItem: (b: T | undefined, l: T, r: T) => T): T[] {
  const B = new Map(base.map(x => [x.id, x])), L = new Map(local.map(x => [x.id, x])), R = new Map(remote.map(x => [x.id, x]))
  const out: T[] = []
  for (const r of remote) {
    const l = L.get(r.id), b = B.get(r.id)
    if (l) out.push(mergeItem(b, l, r))
    else if (!b) out.push(r) // người khác mới thêm
  }
  for (const l of local) if (!R.has(l.id) && !B.has(l.id)) out.push(l) // mình mới thêm
  return out
}

export function mergeEvents(base: EventNote[], local: EventNote[], remote: EventNote[]): EventNote[] {
  return mergeList(base, local, remote, (b, l, r) => {
    if (same(l, b)) return r
    const members = mergeList(b?.members ?? [], l.members, r.members, (mb, ml, mr) => {
      if (same(ml, mb)) return mr
      if (same(mr, mb)) return ml
      const entries = mergeList(mb?.entries ?? [], ml.entries, mr.entries, (eb, el, er) => same(el, eb) ? er : el)
      return { id: ml.id, name: mb && ml.name === mb.name ? mr.name : ml.name, entries }
    })
    return { id: l.id, name: b && l.name === b.name ? r.name : l.name, members }
  })
}

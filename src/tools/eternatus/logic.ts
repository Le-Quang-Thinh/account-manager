// Tab Eternatus: quy trình xử lý danh sách account, đánh dấu OK / Fail.
// Chỉ lưu ở localStorage của trình duyệt (không dùng server / DB).

export type Status = 'pending' | 'ok' | 'fail'

export interface Acc {
  id: string
  raw: string // nội dung account (vd user:pass), một dòng
  note: string // ghi chú tùy ý
  status: Status // trạng thái xử lý
  at: number // thời điểm thêm vào list (ms)
  doneAt: number | null // thời điểm đánh dấu OK/Fail (ms); null nếu chưa xử lý
}

const KEY = 'accmgr_eternatus'
const STATUSES: Status[] = ['pending', 'ok', 'fail']

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

export function load(): Acc[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    // chuẩn hóa để chịu được dữ liệu cũ/thiếu field
    return v.filter(x => x && typeof x.raw === 'string').map(x => ({
      id: String(x.id ?? newId()),
      raw: String(x.raw),
      note: String(x.note ?? ''),
      status: STATUSES.includes(x.status) ? x.status as Status : 'pending',
      at: Number(x.at) || Date.now(),
      doneAt: Number.isFinite(x.doneAt) ? Number(x.doneAt) : null,
    }))
  } catch (e) { return [] }
}

export function save(list: Acc[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch (e) { /* bỏ qua (chế độ riêng tư...) */ }
}

// Gộp nhiều dòng account vào list, bỏ dòng rỗng và trùng (so khớp theo raw sau khi trim).
// Account mới luôn bắt đầu ở trạng thái "pending" (chưa xử lý).
export function addLines(list: Acc[], text: string, note = ''): { list: Acc[]; added: number; dup: number } {
  const seen = new Set(list.map(a => a.raw))
  const add: Acc[] = []
  let dup = 0
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim()
    if (!raw) continue
    if (seen.has(raw)) { dup++; continue }
    seen.add(raw)
    add.push({ id: newId(), raw, note: note.trim(), status: 'pending', at: Date.now(), doneAt: null })
  }
  // mới thêm nằm trên đầu cho dễ thấy
  return { list: [...add.reverse(), ...list], added: add.length, dup }
}

// Đếm số account theo từng trạng thái
export function counts(list: Acc[]): { total: number; pending: number; ok: number; fail: number } {
  const c = { total: list.length, pending: 0, ok: 0, fail: 0 }
  for (const a of list) c[a.status]++
  return c
}

export function dateText(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const STATUS_LABEL: Record<Status, string> = { pending: 'Chưa xử lý', ok: 'OK', fail: 'Fail' }
export const STATUS_TONE: Record<Status, string> = { pending: 'tone-amber', ok: 'tone-teal', fail: 'tone-red' }

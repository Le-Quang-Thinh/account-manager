// Đồng bộ tab Ghi chú lên server (theo user đăng nhập). Không phụ thuộc React.
export type Item = { id: string; title: string; text: string }
export interface Notes { search: Item[]; coords: Item[] }
export interface Remote { rev: number; notes: Notes }
export type PushResult = { ok: true; rev: number } | { ok: false; conflict: boolean; unauthorized?: boolean }

const API = './api/notes'

const clean = (v: unknown): Item[] => Array.isArray(v)
  ? v.filter(x => x && typeof x.id === 'string').map(x => ({ id: x.id, title: String(x.title ?? ''), text: String(x.text ?? '') }))
  : []
export const normalize = (n: Partial<Notes> | undefined): Notes => ({ search: clean(n?.search), coords: clean(n?.coords) })

// null: user chưa có dữ liệu trên server. Ném lỗi nếu không gọi được server.
export async function pull(): Promise<Remote | null> {
  const r = await fetch(API, { cache: 'no-store' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const j = await r.json()
  return j ? { rev: j.rev, notes: normalize(j.notes) } : null
}

export async function push(baseRev: number, notes: Notes): Promise<PushResult> {
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev, notes }) })
    if (r.status === 401) return { ok: false, conflict: false, unauthorized: true }
    if (r.status === 409) return { ok: false, conflict: true }
    if (!r.ok) return { ok: false, conflict: false }
    return { ok: true, rev: (await r.json()).rev }
  } catch (e) { return { ok: false, conflict: false } }
}

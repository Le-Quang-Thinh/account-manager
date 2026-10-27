// Đồng bộ Note event lên server (theo user đăng nhập). Không phụ thuộc React.
import type { EventNote } from './logic'

const API = './api/eventnotes'

export interface Remote { rev: number; events: EventNote[] }
export type PushResult = { ok: true; rev: number } | { ok: false; conflict: boolean; unauthorized?: boolean }

// null: user chưa có dữ liệu trên server. Ném lỗi nếu không gọi được server.
export async function pull(): Promise<Remote | null> {
  const r = await fetch(API, { cache: 'no-store' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

export async function push(baseRev: number, events: EventNote[]): Promise<PushResult> {
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev, events }) })
    if (r.status === 401) return { ok: false, conflict: false, unauthorized: true }
    if (r.status === 409) return { ok: false, conflict: true }
    if (!r.ok) return { ok: false, conflict: false }
    return { ok: true, rev: (await r.json()).rev }
  } catch (e) { return { ok: false, conflict: false } }
}

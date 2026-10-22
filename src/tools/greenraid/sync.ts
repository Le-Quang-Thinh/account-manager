// Đồng bộ batch / lịch sử xuất của tool Green Raid lên server (SQLite, theo user đăng nhập). Không phụ thuộc React.
import type { EvBatch, ExportRecord } from './logic'

const API = './api/greenraid'

export interface Remote { rev: number; batches: EvBatch[]; history: ExportRecord[] }
export type PushResult = { ok: true; rev: number } | { ok: false; conflict: boolean; rev?: number; unauthorized?: boolean }

// null: user chưa có dữ liệu trên server. Ném lỗi nếu không gọi được server.
export async function pull(): Promise<Remote | null> {
  const r = await fetch(API, { cache: 'no-store' })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

export async function push(baseRev: number, batches: EvBatch[], history: ExportRecord[]): Promise<PushResult> {
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev, batches, history }) })
    if (r.status === 401) return { ok: false, conflict: false, unauthorized: true }
    if (r.status === 409) return { ok: false, conflict: true, rev: (await r.json()).rev }
    if (!r.ok) return { ok: false, conflict: false }
    return { ok: true, rev: (await r.json()).rev }
  } catch (e) { return { ok: false, conflict: false } }
}

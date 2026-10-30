import type { Account, BatchMeta, Settings, Status, Store } from './types'
import type { ZipFile } from '../../shared/lib/zip'

export const PAGE = 400 // số dòng hiện mỗi lần
const API = './api/store'

export function defSettings(): Settings { return { chunk: 100, group: 20, crlf: true, view: 'table' } }
export function fresh(): Store { return { v: 3, settings: defSettings(), accounts: [], seq: 1, batchSeq: 0, batchMeta: {}, tags: [] } }

// Chuẩn hoá dữ liệu đọc từ file hoặc file sao lưu (có thể là bản cũ). Trả về null nếu không đúng dạng.
export function normalize(raw: unknown): Store | null {
  // dữ liệu bên ngoài chưa rõ kiểu, được chuẩn hoá bên dưới
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j: any = raw
  if (!j || !Array.isArray(j.accounts)) return null
  const ver = j.v || 1
  j.settings = Object.assign(defSettings(), j.settings || {})
  if (ver < 3) { j.settings.group = 20; j.settings.chunk = 100 } // bản cũ: nhóm hiển thị 20, file zip mặc định 100
  j.v = 3
  j.seq = j.seq || (Math.max(0, ...j.accounts.map((a: Account) => a.id)) + 1)
  j.batchMeta = j.batchMeta || {}
  j.tags = Array.isArray(j.tags) ? j.tags.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : []
  let legacy = false
  for (const a of j.accounts as Account[]) {
    if (!a.batch) { a.batch = 1; legacy = true } // dữ liệu bản cũ -> Batch 1
    if (a.inList === undefined) a.inList = true // mặc định account nằm trong tab Danh sách
  }
  j.batchSeq = Math.max(j.batchSeq || 0, 0, ...j.accounts.map((a: Account) => a.batch))
  if (legacy && !j.batchMeta[1]) j.batchMeta[1] = { at: Math.min(...j.accounts.map((a: Account) => a.addedAt || Date.now())), name: '' }
  return j as Store
}

// S là một object dùng chung, sửa trực tiếp rồi gọi save(). Được nạp từ file JSON bởi initStore() trước khi giao diện chạy.
export const S: Store = fresh()
export function replaceS(n: Store) {
  for (const k of Object.keys(S)) delete (S as unknown as Record<string, unknown>)[k]
  Object.assign(S, n)
}

// ----- lưu ra file JSON qua API (data/accounts.json) -----
// Mỗi lần save() gửi bản mới nhất; nếu đang gửi dở thì gộp lại và gửi tiếp ngay khi xong.
let storage: 'file' | 'local' = 'local'
let inflight = false
let dirty = false
let warned = false
export const isFileStorage = () => storage === 'file' || syncing

function warnOnce(msg: string) {
  if (warned) return
  warned = true
  alert(msg)
}

async function pump() {
  if (inflight || !dirty) return
  inflight = true
  dirty = false
  try {
    const r = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
    if (r.status === 401) { alert('Phiên đăng nhập đã hết hạn, trang sẽ tải lại để đăng nhập.'); location.reload(); return }
    if (!r.ok) throw new Error('HTTP ' + r.status)
    warned = false
  } catch (e) {
    dirty = true // thử lại ở lần lưu kế tiếp
    warnOnce('Không lưu được dữ liệu vào file trên máy chủ. Hãy kiểm tra server còn chạy không, và tải file sao lưu ngay!')
  }
  inflight = false
  if (dirty && !warned) pump()
}

// Dự phòng khi không có server: mỗi user một key localStorage riêng (theo id) nên không lẫn dữ liệu giữa các tài khoản
let localKey = ''
const keyFor = (userKey: string) => 'accmgr_store_v1:' + userKey
const readLocal = () => {
  try { return normalize(JSON.parse(localStorage.getItem(localKey) || 'null')) } catch (e) { return null }
}

// Luôn ghi bản sao vào localStorage (của đúng user) để lần mở sau hiện ngay
const writeLocal = () => {
  try { localStorage.setItem(localKey, JSON.stringify(S)); return true } catch (e) { return false }
}

export function save() {
  const ok = writeLocal()
  if (syncing) return ok // chưa đồng bộ xong với server: không đẩy bản localStorage (có thể cũ) lên đè DB
  if (storage === 'local') {
    if (!ok) warnOnce('Không lưu được vào trình duyệt (đầy bộ nhớ?). Hãy tải file sao lưu ngay!')
    return ok
  }
  dirty = true
  pump()
  return true
}

// Giao diện đăng ký để biết khi nào đang đồng bộ / khi nào dữ liệu bị thay bằng bản từ server
let syncing = false
let dataVersion = 0
const listeners = new Set<() => void>()
export const subscribeStore = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const isSyncing = () => syncing
export const storeVersion = () => dataVersion
const emit = () => listeners.forEach(l => l())

// Mở app: hiện ngay dữ liệu trong localStorage của user này (userKey = id user, hoặc 'offline'),
// đồng thời gọi server (DB); xong thì thay bằng bản từ server (user mới chưa có dữ liệu thì store trống).
export function initStore(userKey: string) {
  localKey = keyFor(userKey)
  replaceS(readLocal() ?? fresh())
  syncing = true
  fetch(API, { cache: 'no-store' })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = normalize(await r.json()) ?? fresh()
      storage = 'file'
      replaceS(data)
      writeLocal()
      dataVersion++
    })
    .catch(() => { storage = 'local' }) // không gọi được server: giữ bản localStorage đang hiện
    .finally(() => { syncing = false; emit() })
}

// Cảnh báo khi đóng tab lúc còn dữ liệu chưa ghi xong
window.addEventListener('beforeunload', e => { if (inflight || dirty) e.preventDefault() })

export function addTags(text: string) { // mỗi dòng (hoặc dấu phẩy) một tag; bỏ trùng không phân biệt hoa thường
  let n = 0
  for (const t0 of String(text || '').split(/[\n,;]+/)) {
    const t = t0.trim()
    if (!t) continue
    if (S.tags.some(x => x.toLowerCase() === t.toLowerCase())) continue
    S.tags.push(t); n++
  }
  return n
}
export function removeTag(t: string) { const i = S.tags.indexOf(t); if (i >= 0) S.tags.splice(i, 1); return i >= 0 }

export const NL = () => S.settings.crlf ? '\r\n' : '\n'
export const parseUser = (r: string) => (r.trim().split(/[|:;,\t ]+/)[0]) || r
export const byStatus = (s: Status) => S.accounts.filter(a => a.status === s)
export const inListAccounts = () => S.accounts.filter(a => a.inList !== false)
export function batchIds() {
  const set = new Set(S.accounts.map(a => a.batch))
  return [...set].sort((x, y) => x - y)
}
export function batchLabel(b: number) {
  const m: Partial<BatchMeta> = S.batchMeta[b] || {}
  let d = ''
  if (m.at) { const x = new Date(m.at), p = (n: number) => String(n).padStart(2, '0'); d = ` · ${p(x.getDate())}/${p(x.getMonth() + 1)}` }
  return `Batch ${b}` + (m.name ? ` · ${m.name}` : '') + d
}

// Mỗi lần nhập tạo 1 batch mới, tất cả account vào Farm. Trùng tên tài khoản (ở mọi batch) thì bỏ qua.
export function importLines(text: string, name?: string): { add: number; dup: number; batch: number | null } {
  const seen = new Set(S.accounts.map(a => a.user.toLowerCase()))
  const items: { raw: string; user: string }[] = []
  let dup = 0
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line) continue
    const u = parseUser(line), k = u.toLowerCase()
    if (seen.has(k)) { dup++; continue }
    seen.add(k); items.push({ raw: line, user: u })
  }
  if (!items.length) return { add: 0, dup, batch: null }
  const b = ++S.batchSeq
  S.batchMeta[b] = { at: Date.now(), name: (name || '').trim() }
  for (const x of items) S.accounts.push({ id: S.seq++, raw: x.raw, user: x.user, batch: b, status: 'farm', inList: true, note: '', sale: '', soldAt: null, prev: 'special', addedAt: Date.now() })
  return { add: items.length, dup, batch: b }
}
// Số account Farm đang nằm trong Danh sách của từng batch (để biết batch nào bị lẻ)
export function farmCount(b: number) { return S.accounts.filter(a => a.batch === b && a.inList !== false && a.status === 'farm').length }
// Thêm account vào batch có sẵn (b = 0 hoặc batch không tồn tại thì tạo batch mới). Trùng tên ở mọi batch thì bỏ qua.
// Dòng trùng với account Farm đang ở batch khác thì chuyển account đó sang batch này (không tạo bản sao).
// pos: 'end' (mặc định) xếp account mới ở cuối batch, 'start' xếp ở đầu batch (thứ tự trong batch = thứ tự trong S.accounts).
export function addToBatch(text: string, b: number, pos: 'start' | 'end' = 'end'): { add: number; moved: number; dup: number; batch: number | null } {
  if (!b || !S.batchMeta[b]) return { ...importLines(text), moved: 0 }
  const byUser = new Map(S.accounts.map(a => [a.user.toLowerCase(), a]))
  const seen = new Set(byUser.keys())
  const fresh: typeof S.accounts = []
  let add = 0, dup = 0, moved = 0
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line) continue
    const u = parseUser(line), k = u.toLowerCase()
    if (seen.has(k)) {
      const ex = byUser.get(k)
      if (ex && ex.batch !== b && ex.status === 'farm' && ex.inList !== false) { ex.batch = b; byUser.delete(k); fresh.push(ex); moved++ } else dup++
      continue
    }
    seen.add(k)
    fresh.push({ id: S.seq++, raw: line, user: u, batch: b, status: 'farm', inList: true, note: '', sale: '', soldAt: null, prev: 'special', addedAt: Date.now() })
    add++
  }
  if (fresh.length) {
    const set = new Set(fresh)
    const rest = S.accounts.filter(a => !set.has(a))
    const at = pos === 'start' ? rest.findIndex(a => a.batch === b) : -1
    if (at < 0) rest.push(...fresh); else rest.splice(at, 0, ...fresh)
    S.accounts.length = 0
    S.accounts.push(...rest)
  }
  return { add, moved, dup, batch: add || moved ? b : null }
}
// Sửa nội dung một dòng account. Trả về lỗi (chuỗi) nếu rỗng hoặc tên tài khoản trùng account khác.
export function editRaw(id: number, text: string): string | null {
  const a = S.accounts.find(x => x.id === id)
  const raw = text.trim()
  if (!a) return 'Không tìm thấy account.'
  if (!raw) return 'Nội dung không được để trống.'
  const u = parseUser(raw)
  if (S.accounts.some(x => x.id !== id && x.user.toLowerCase() === u.toLowerCase())) return `Tài khoản "${u}" đã tồn tại.`
  a.raw = raw; a.user = u
  return null
}
// Chuyển account sang batch khác (b = 0 tạo batch mới)
export function moveBatch(ids: number[], b: number) {
  const set = new Set(ids)
  const list = S.accounts.filter(a => set.has(a.id))
  if (!list.length) return { n: 0, batch: null as number | null }
  if (!b || !S.batchMeta[b]) { b = ++S.batchSeq; S.batchMeta[b] = { at: Date.now(), name: '' } }
  let n = 0
  for (const a of list) if (a.batch !== b) { a.batch = b; n++ }
  return { n, batch: b }
}
export function setSpecial(ids: number[], note?: string | null) {
  const set = new Set(ids)
  let n = 0
  for (const a of S.accounts) {
    if (!set.has(a.id) || a.status === 'sold') continue
    a.status = 'special'
    if (note != null && note !== '') a.note = note
    n++
  }
  return n
}
export function setFarm(ids: number[]) {
  const set = new Set(ids)
  let n = 0
  for (const a of S.accounts) if (set.has(a.id) && a.status === 'special') { a.status = 'farm'; a.inList = true; n++ }
  return n
}
// Chỉ account đang ở Special mới bán được
export function sell(ids: number[], sale?: string) {
  const set = new Set(ids)
  let n = 0
  for (const a of S.accounts) {
    if (!set.has(a.id) || a.status !== 'special') continue
    a.prev = 'special'; a.status = 'sold'; a.sale = sale || ''; a.soldAt = Date.now(); n++
  }
  return n
}
export function unsell(id: number) {
  const a = S.accounts.find(x => x.id === id)
  if (!a || a.status !== 'sold') return false
  a.status = a.prev || 'special'; a.sale = ''; a.soldAt = null
  return true
}
export function setNote(ids: number[], note?: string) {
  const set = new Set(ids)
  let n = 0
  for (const a of S.accounts) if (set.has(a.id)) { a.note = (note || '').trim(); n++ }
  return n
}
// Dán danh sách special: mỗi dòng "account:password # ghi chú" (hoặc chỉ tên tài khoản)
export function bulkSpecial(text: string) {
  const idx = new Map<string, Account>()
  for (const a of S.accounts) if (a.status !== 'sold') idx.set(a.user.toLowerCase(), a)
  let n = 0
  const miss: string[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line) continue
    const p = line.indexOf('#')
    const acc = (p >= 0 ? line.slice(0, p) : line).trim(), note = p >= 0 ? line.slice(p + 1).trim() : ''
    const a = idx.get(parseUser(acc).toLowerCase())
    if (!a) { miss.push(line); continue }
    a.status = 'special'
    if (note) a.note = note
    n++
  }
  return { n, miss }
}
// XÁC NHẬN: loại Special và Đã bán khỏi tab Danh sách, chỉ để lại Farm.
// Dữ liệu không mất: Special/Đã bán vẫn còn nguyên ở tab riêng của chúng.
export const inListFarm = () => S.accounts.filter(a => a.inList !== false && a.status === 'farm')
export function confirmList() {
  let special = 0, sold = 0, kept = 0
  for (const a of S.accounts) {
    if (a.inList === false) continue
    if (a.status === 'special') { a.inList = false; special++ }
    else if (a.status === 'sold') { a.inList = false; sold++ }
    else kept++
  }
  return { special, sold, kept }
}
// Chia file theo từng batch, mỗi file `size` dòng (file cuối của batch có thể ít hơn)
export function chunkByBatch(list: Account[], size: number, kind: string) {
  const groups = new Map<number, Account[]>()
  for (const a of list) {
    const g = groups.get(a.batch)
    if (g) g.push(a); else groups.set(a.batch, [a])
  }
  const files: ZipFile[] = []
  ;[...groups.keys()].sort((x, y) => x - y).forEach(b => {
    const arr = groups.get(b)!
    let n = 0
    for (let i = 0; i < arr.length; i += size) {
      n++
      files.push({ name: `batch${b}-${kind}-${String(n).padStart(2, '0')}.txt`, text: arr.slice(i, i + size).map(a => a.raw).join(NL()) })
    }
  })
  return files
}
// Gom nhóm theo ghi chú giống hệt nhau (===, đã bỏ khoảng trắng 2 đầu). Nhóm không ghi chú xếp cuối.
export function noteGroups(list: Account[]) {
  const m = new Map<string, Account[]>()
  for (const a of list) {
    const k = (a.note || '').trim()
    const g = m.get(k)
    if (g) g.push(a); else m.set(k, [a])
  }
  return [...m.entries()]
    .sort((x, y) => ((x[0] === '' ? 1 : 0) - (y[0] === '' ? 1 : 0)) || x[0].localeCompare(y[0], 'vi'))
    .map(([note, items]) => ({ note, items }))
}
export const noteOrder = (list: Account[]) => noteGroups(list).flatMap(g => g.items)
export function noteSlug(n: string) { return (n || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) }
// Mỗi ghi chú 1 file; nhóm quá `size` dòng thì chia thêm -p01, -p02…
export function chunkByNote(list: Account[], size: number, kind: string) {
  const files: ZipFile[] = []
  noteGroups(list).forEach((g, gi) => {
    const base = `${kind}-${String(gi + 1).padStart(2, '0')}-${noteSlug(g.note) || 'khong-ghi-chu'}`
    const parts = Math.ceil(g.items.length / size)
    for (let p = 0; p < parts; p++) {
      files.push({ name: parts > 1 ? `${base}-p${String(p + 1).padStart(2, '0')}.txt` : `${base}.txt`, text: g.items.slice(p * size, (p + 1) * size).map(a => a.raw).join(NL()) })
    }
  })
  return files
}
// Nhóm hiển thị / copy: nhóm thứ g (từ 0) của batch b trong danh sách đang hiện
export function groupSlice(list: Account[], b: number, g: number, G: number) { return list.filter(a => a.batch === b).slice(g * G, (g + 1) * G) }
export const rawText = (list: Account[]) => list.map(a => a.raw).join(NL())
export function csvCell(v: unknown) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"' }
export const STL: Record<Status, string> = { farm: 'Farm', special: 'Special', sold: 'Đã bán' }
export function fmtDate(t: number | null) {
  if (!t) return ''
  const d = new Date(t), p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
export function toCSV(list: Account[]) {
  const head = ['STT', 'Batch', 'Tài khoản (nguyên dòng)', 'Trạng thái', 'Ghi chú / Special', 'Thông tin bán', 'Ngày bán']
  const rows = list.map((a, i) => [i + 1, batchLabel(a.batch), a.raw, STL[a.status], a.note, a.sale, fmtDate(a.soldAt)])
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}
// Gắn ghi chú (tag): account Farm thì chuyển sang Special kèm ghi chú, còn lại chỉ đổi ghi chú
export function applyTag(ids: number[], tag: string) {
  let n = 0
  const f = ids.filter(i => { const a = S.accounts.find(x => x.id === i); return a && a.status === 'farm' }), o = ids.filter(i => !f.includes(i))
  if (f.length) n += setSpecial(f, tag)
  if (o.length) n += setNote(o, tag)
  return n
}

// Tool "Làm quest": theo dõi tiến trình làm quest 5 ngày cho nhiều đợt account.
// Lưu localStorage (theo userKey). Biến chính của mỗi thẻ là chuỗi ngày đã bắt (5 ngày khác nhau) + đã nhận thẻ.

export const DAYS = 5 // số ngày khác nhau cần bắt pkm (task 2)

export interface QuestCard {
  id: string
  text: string // nội dung account (một dòng từ file import)
  catchDays: string[] // các ngày đã bắt pkm, dạng 'YYYY-MM-DD', không trùng ngày, tối đa DAYS
  claimed: boolean // đã nhận thẻ (task 3)
  note: string
}

export interface QuestBatch {
  id: string
  name: string
  createdAt: number // ngày bắt đầu đợt
  cards: QuestCard[]
}

export type View = 'list' | 'grid'

export interface QuestState {
  v: number
  batches: QuestBatch[]
  autoClaim: boolean // tự nhận thẻ khi đủ 5 ngày
  view: View
}

export type Stage = 'new' | 'doing' | 'caught-today' | 'ready' | 'done'
export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Chưa bắt đầu', doing: 'Đang làm', 'caught-today': 'Đã bắt hôm nay', ready: 'Sẵn sàng nhận', done: 'Hoàn tất',
}

// ===== ngày tháng =====
const pad = (n: number) => String(n).padStart(2, '0')
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fmtDay = (s: string) => { const p = s.split('-'); return `${p[2]}/${p[1]}` } // 'dd/mm'
export const fmtFull = (t: number) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` }
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return todayStr(d) }

// ===== trạng thái thẻ =====
export const daysDone = (c: QuestCard) => c.catchDays.length >= DAYS // task 2 xong (đủ 5 ngày; đi bộ coi như tự đủ)
export const cardDone = (c: QuestCard) => c.claimed // hoàn tất = đã nhận thẻ
export const isReady = (c: QuestCard) => daysDone(c) && !c.claimed // sẵn sàng nhận thẻ
export const caughtToday = (c: QuestCard, today: string) => c.catchDays.includes(today)
export const needToday = (c: QuestCard, today: string) => !c.claimed && c.catchDays.length < DAYS && !caughtToday(c, today)

export function stage(c: QuestCard, today: string): Stage {
  if (c.claimed) return 'done'
  if (daysDone(c)) return 'ready'
  if (caughtToday(c, today)) return 'caught-today'
  return c.catchDays.length > 0 ? 'doing' : 'new'
}

// ngày xong sớm nhất (khi còn thiếu ngày); null nếu đã đủ ngày
export function earliest(c: QuestCard, today: string): string | null {
  const remaining = DAYS - c.catchDays.length
  if (remaining <= 0) return null
  const offset = caughtToday(c, today) ? remaining : remaining - 1
  return addDays(today, offset)
}

// ===== id, import =====
let seq = 0
const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6)

export function makeBatch(name: string, text: string): QuestBatch {
  const cards: QuestCard[] = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .map(t => ({ id: uid(), text: t, catchDays: [], claimed: false, note: '' }))
  return { id: uid(), name: name.replace(/\.[^.]+$/, '') || 'Đợt mới', createdAt: Date.now(), cards }
}

export const batchDone = (b: QuestBatch) => b.cards.length > 0 && b.cards.every(cardDone)
export const batchProgress = (b: QuestBatch) => b.cards.reduce((n, c) => n + (cardDone(c) ? 1 : 0), 0)

// ===== lưu / nạp localStorage =====
const KEY = (userKey: string) => `quest_${userKey || 'anon'}`

function normalize(j: unknown): QuestState {
  const s = j as Partial<QuestState>
  const batches = Array.isArray(s?.batches) ? s!.batches!.filter(b => b && Array.isArray(b.cards)).map(b => ({
    id: String(b.id), name: String(b.name ?? ''), createdAt: Number(b.createdAt) || Date.now(),
    cards: b.cards.map(c => ({
      id: String(c.id), text: String(c.text ?? ''),
      catchDays: Array.isArray(c.catchDays) ? [...new Set(c.catchDays.filter((d: unknown) => typeof d === 'string'))].slice(0, DAYS) : [],
      claimed: !!c.claimed, note: typeof c.note === 'string' ? c.note : '',
    })),
  })) : []
  return { v: 1, batches, autoClaim: !!s?.autoClaim, view: s?.view === 'grid' ? 'grid' : 'list' }
}

export function loadState(userKey: string): QuestState {
  try {
    const raw = localStorage.getItem(KEY(userKey))
    if (raw) return normalize(JSON.parse(raw))
  } catch { /* bỏ qua: dữ liệu hỏng hoặc bị chặn */ }
  return { v: 1, batches: [], autoClaim: false, view: 'list' }
}

export function saveState(s: QuestState, userKey: string): boolean {
  try { localStorage.setItem(KEY(userKey), JSON.stringify({ v: 1, batches: s.batches, autoClaim: s.autoClaim, view: s.view })); return true }
  catch { return false }
}

// ===== reducer =====
export type Action =
  | { type: 'import'; batch: QuestBatch }
  | { type: 'rename'; id: string; name: string }
  | { type: 'deleteBatch'; id: string }
  | { type: 'deleteCard'; id: string }
  | { type: 'catch'; ids: string[] }
  | { type: 'undoCatch'; ids: string[] }
  | { type: 'removeDay'; id: string; day: string }
  | { type: 'claim'; ids: string[] }
  | { type: 'unclaim'; ids: string[] }
  | { type: 'note'; id: string; note: string }
  | { type: 'autoClaim'; on: boolean }
  | { type: 'view'; view: View }
  | { type: 'replace'; state: QuestState }

function patch(s: QuestState, ids: Set<string>, fn: (c: QuestCard) => QuestCard): QuestState {
  return {
    ...s,
    batches: s.batches.map(b => b.cards.some(c => ids.has(c.id))
      ? { ...b, cards: b.cards.map(c => (ids.has(c.id) ? fn(c) : c)) }
      : b),
  }
}

export function reducer(s: QuestState, a: Action): QuestState {
  switch (a.type) {
    case 'import': return { ...s, batches: [a.batch, ...s.batches] }
    case 'rename': return { ...s, batches: s.batches.map(b => (b.id === a.id ? { ...b, name: a.name } : b)) }
    case 'deleteBatch': return { ...s, batches: s.batches.filter(b => b.id !== a.id) }
    case 'deleteCard': return { ...s, batches: s.batches.map(b => ({ ...b, cards: b.cards.filter(c => c.id !== a.id) })) }
    case 'catch': {
      const ids = new Set(a.ids); const today = todayStr()
      return patch(s, ids, c => {
        if (c.claimed || c.catchDays.length >= DAYS || c.catchDays.includes(today)) return c
        const catchDays = [...c.catchDays, today]
        return { ...c, catchDays, claimed: catchDays.length >= DAYS && s.autoClaim ? true : c.claimed }
      })
    }
    case 'undoCatch': {
      const ids = new Set(a.ids); const today = todayStr()
      return patch(s, ids, c => (c.catchDays.includes(today)
        ? { ...c, catchDays: c.catchDays.filter(d => d !== today), claimed: false } : c))
    }
    case 'removeDay':
      return patch(s, new Set([a.id]), c => ({ ...c, catchDays: c.catchDays.filter(d => d !== a.day), claimed: false }))
    case 'claim':
      return patch(s, new Set(a.ids), c => (daysDone(c) ? { ...c, claimed: true } : c))
    case 'unclaim':
      return patch(s, new Set(a.ids), c => ({ ...c, claimed: false }))
    case 'note':
      return patch(s, new Set([a.id]), c => ({ ...c, note: a.note }))
    case 'autoClaim': return { ...s, autoClaim: a.on }
    case 'view': return { ...s, view: a.view }
    case 'replace': return a.state
    default: return s
  }
}

// ===== xuất CSV (mở được bằng Google Sheet / Excel) =====
const csvCell = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
export function toCSV(rows: { batch: string; card: QuestCard }[]): string {
  const today = todayStr()
  const head = ['Dot', 'Account', 'So ngay', 'Cac ngay da bat', 'Trang thai']
  const body = rows.map(({ batch, card }) => [
    batch, card.text, `${card.catchDays.length}/${DAYS}`,
    card.catchDays.map(fmtDay).join(' '), STAGE_LABEL[stage(card, today)],
  ].map(csvCell).join(','))
  return '﻿' + [head.join(','), ...body].join('\r\n')
}

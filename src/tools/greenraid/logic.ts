// Quản lý event: dữ liệu, reducer và logic xuất 1000. Không phụ thuộc React.

export const FAIL_LABELS = [
  { id: 'fail_2_4', label: 'Fail 2-4' },
  { id: 'fail_walk', label: 'Fail Walk' },
  { id: 'fail_raid', label: 'Fail Raid' },
  { id: 'failed_quest', label: 'Failed Quest' },
  { id: 'fail_card', label: 'Fail Thẻ' },
] as const
export type FailLabel = typeof FAIL_LABELS[number]['id']
export const failName = (id: string) => FAIL_LABELS.find(f => f.id === id)?.label ?? id

export interface EvAccount {
  id: string
  text: string
  checked: boolean
  failLabel: '' | FailLabel
  special: boolean
  exported: boolean
  exportBatchId: string
}
export interface EvBatch { id: string; name: string; fileName: string; accounts: EvAccount[] }
export interface ExportRecord { id: string; name: string; count: number; createdAt: number }

export type StatusFilter = 'all' | 'todo' | 'success' | FailLabel
export type SummaryFilter = 'processed' | 'success' | 'special' | 'fail'
export type OutFilter = 'success' | FailLabel | null

export interface EvState {
  batches: EvBatch[]
  history: ExportRecord[]
  selectedId: string
  search: string
  filter: StatusFilter
  view: 'batch' | 'summary'
  leftTab: 'active' | 'done'
  exportTab: 'ready' | 'done'
  summaryFilter: SummaryFilter
  outFilter: OutFilter
}

export const STORE_KEY = 'event-account-manager-v2-preview-safe'
export const STORE_VERSION = 3
export const EXPORT_LIMIT = 1000
export const BLOCK_SIZE = 20

export const initialState: EvState = {
  batches: [], history: [], selectedId: '', search: '', filter: 'all', view: 'batch',
  leftTab: 'active', exportTab: 'ready', summaryFilter: 'processed', outFilter: null,
}

let seq = 0
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2)}`

export function makeBatch(fileName: string, content: string): EvBatch {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return {
    id: newId(),
    name: fileName.replace(/\.txt$/i, ''),
    fileName,
    accounts: lines.map(text => ({ id: newId(), text, checked: false, failLabel: '', special: false, exported: false, exportBatchId: '' })),
  }
}

export const isSuccess = (a: EvAccount) => a.checked && !a.failLabel
export const isProcessed = (a: EvAccount) => a.checked || a.special

export function batchStats(b: EvBatch) {
  let total = 0, success = 0, fail = 0, todo = 0
  for (const a of b.accounts) {
    if (a.exported) continue
    total++
    if (!a.checked) todo++
    else if (a.failLabel) fail++
    else success++
  }
  return { total, success, fail, todo }
}

// Hoàn thành: có account và tất cả đều Success (tick, không lỗi). Account đã xuất vốn là Success nên vẫn tính.
export const isComplete = (b: EvBatch) => b.accounts.length > 0 && b.accounts.every(isSuccess)

// Batch đã xuất hết: có account và không còn account nào chưa xuất
export const isDrained = (b: EvBatch) => b.accounts.length > 0 && b.accounts.every(a => a.exported)

export function matchesStatus(a: EvAccount, f: StatusFilter) {
  if (f === 'all') return true
  if (f === 'todo') return !a.checked
  if (f === 'success') return isSuccess(a)
  return a.failLabel === f
}

export type Action =
  | { type: 'ui'; patch: Partial<EvState> }
  | { type: 'import'; batches: EvBatch[] }
  | { type: 'rename'; id: string; name: string }
  | { type: 'delete'; id: string }
  | { type: 'deleteMany'; ids: string[] }
  | { type: 'tick'; batchId: string; ids: string[]; checked: boolean }
  | { type: 'tickAll'; batchId: string; checked: boolean }
  | { type: 'fail'; batchId: string; id: string; label: '' | FailLabel }
  | { type: 'special'; batchId: string; id: string }
  | { type: 'replace'; state: EvState }
  | { type: 'export'; ids: Set<string>; record: ExportRecord }

function patchAccounts(s: EvState, batchId: string, fn: (a: EvAccount) => EvAccount): EvState {
  const batches = s.batches.map(b => b.id === batchId ? { ...b, accounts: b.accounts.map(fn) } : b)
  return fixTab({ ...s, batches })
}

// Thao tác làm batch đang chọn không còn 100% thì tab trái về "Đang quản lý"
function fixTab(s: EvState): EvState {
  if (s.leftTab !== 'done') return s
  const cur = s.batches.find(b => b.id === s.selectedId)
  return cur && isComplete(cur) ? s : { ...s, leftTab: 'active' }
}

export function reducer(s: EvState, a: Action): EvState {
  switch (a.type) {
    case 'replace': return a.state
    case 'ui': return { ...s, ...a.patch }
    case 'import': {
      if (!a.batches.length) return s
      return { ...s, batches: [...s.batches, ...a.batches], selectedId: a.batches[0].id, view: 'batch', leftTab: 'active', search: '', filter: 'all' }
    }
    case 'rename': {
      const name = a.name.trim()
      return name ? { ...s, batches: s.batches.map(b => b.id === a.id ? { ...b, name } : b) } : s
    }
    case 'delete': {
      const batches = s.batches.filter(b => b.id !== a.id)
      const selectedId = s.selectedId === a.id ? (batches[0]?.id ?? '') : s.selectedId
      return fixTab({ ...s, batches, selectedId })
    }
    case 'deleteMany': {
      const gone = new Set(a.ids)
      const batches = s.batches.filter(b => !gone.has(b.id))
      const selectedId = gone.has(s.selectedId) ? (batches[0]?.id ?? '') : s.selectedId
      return fixTab({ ...s, batches, selectedId })
    }
    case 'tick': {
      const ids = new Set(a.ids)
      // bỏ tick thì xoá nhãn lỗi; tick thì mặc định Success
      return patchAccounts(s, a.batchId, x => ids.has(x.id) && !x.exported && x.checked !== a.checked ? { ...x, checked: a.checked, failLabel: '' } : x)
    }
    case 'tickAll':
      return patchAccounts(s, a.batchId, x => !x.exported && x.checked !== a.checked ? { ...x, checked: a.checked, failLabel: '' } : x)
    case 'fail':
      return patchAccounts(s, a.batchId, x => x.id === a.id && x.checked ? { ...x, failLabel: a.label } : x)
    case 'special':
      return patchAccounts(s, a.batchId, x => x.id === a.id ? { ...x, special: !x.special } : x)
    case 'export': {
      const batches = s.batches.map(b => b.accounts.some(x => a.ids.has(x.id))
        ? { ...b, accounts: b.accounts.map(x => a.ids.has(x.id) ? { ...x, exported: true, exportBatchId: a.record.id } : x) }
        : b)
      return { ...s, batches, history: [a.record, ...s.history] }
    }
  }
}

export function loadState(): EvState {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return initialState
    const d = JSON.parse(raw)
    if (d?.version !== STORE_VERSION || !Array.isArray(d.batches)) return initialState
    return { ...initialState, ...d.state, batches: d.batches, history: Array.isArray(d.history) ? d.history : [] }
  } catch (e) { return initialState }
}

export function saveState(s: EvState): boolean {
  try {
    const { batches, history, ...rest } = s
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: STORE_VERSION, batches, history, state: rest }))
    return true
  } catch (e) { return false }
}

// ===== xuất 1000 =====
export function planExport(batches: EvBatch[]) {
  // dòng đã xuất trước đó, trên toàn bộ batch
  const seen = new Set<string>()
  for (const b of batches) for (const a of b.accounts) if (a.exported) seen.add(a.text.trim())
  const picked: EvAccount[] = []
  let dupes = 0
  for (const b of batches) for (const a of b.accounts) {
    if (!a.checked || a.failLabel || a.special || a.exported) continue
    const key = a.text.trim()
    if (seen.has(key)) { dupes++; continue }
    seen.add(key)
    if (picked.length < EXPORT_LIMIT) picked.push(a)
  }
  return { picked, dupes }
}

export const lineOf = (a: EvAccount) => a.failLabel ? `${a.text}\t[${a.failLabel}]` : a.text

export function outAccounts(batches: EvBatch[], f: Exclude<OutFilter, null>) {
  const out: EvAccount[] = []
  for (const b of batches) for (const a of b.accounts) {
    if (a.exported || !a.checked) continue
    if (f === 'success' ? a.failLabel : a.failLabel !== f) continue
    out.push(a)
  }
  return out
}

export function summaryRows(batches: EvBatch[], f: SummaryFilter) {
  const rows: { batch: EvBatch; batchNo: number; acc: EvAccount; accNo: number }[] = []
  batches.forEach((batch, bi) => {
    let n = 0
    for (const acc of batch.accounts) {
      if (acc.exported) continue
      n++
      const ok = f === 'processed' ? isProcessed(acc) : f === 'success' ? isSuccess(acc) : f === 'special' ? acc.special : !!acc.failLabel
      if (ok) rows.push({ batch, batchNo: bi + 1, acc, accNo: n })
    }
  })
  return rows
}

// ===== sao lưu / khôi phục =====
export function backupJson(s: EvState) {
  const { batches, history, ...rest } = s
  return JSON.stringify({ app: STORE_KEY, version: STORE_VERSION, savedAt: new Date().toISOString(), batches, history, state: rest })
}

// "16:32:53 26/9/2026" (bản cũ) -> timestamp
function legacyTime(v: unknown): number {
  if (typeof v === 'number') return v
  const m = /(\d+):(\d+):(\d+)\s+(\d+)\/(\d+)\/(\d+)/.exec(String(v ?? ''))
  return m ? new Date(+m[6], +m[5] - 1, +m[4], +m[1], +m[2], +m[3]).getTime() : Date.now()
}

// Nhận 3 dạng: file backup mới; state thô của bản cũ (phẳng); hoặc cả file dump localStorage chứa key STORE_KEY
function normalizeBackup(raw: unknown): { batches: EvBatch[]; history: ExportRecord[]; state: object } | null {
  let d = raw as Record<string, unknown> | null
  if (d && typeof d[STORE_KEY] === 'string') d = JSON.parse(d[STORE_KEY] as string)
  else if (d && typeof d[STORE_KEY] === 'object') d = d[STORE_KEY] as Record<string, unknown>
  if (!d || d.version !== STORE_VERSION || !Array.isArray(d.batches)) return null
  if (d.state && typeof d.state === 'object') {
    return { batches: d.batches as EvBatch[], history: Array.isArray(d.history) ? d.history as ExportRecord[] : [], state: d.state }
  }
  const { batches, exportHistory, history, version, savedAt, batchView, exportView, view, ...rest } = d
  void version; void savedAt
  const hist = (Array.isArray(history) ? history : Array.isArray(exportHistory) ? exportHistory : []) as Record<string, unknown>[]
  return {
    batches: batches as EvBatch[],
    history: hist.map(h => ({ ...h, createdAt: legacyTime(h.createdAt) })) as unknown as ExportRecord[],
    state: {
      ...rest,
      view: view === 'summary' ? 'summary' : 'batch',
      leftTab: batchView === 'done' ? 'done' : 'active',
      exportTab: exportView === 'done' ? 'done' : 'ready',
    },
  }
}

export function parseBackup(text: string): EvState | null {
  try {
    const d = normalizeBackup(JSON.parse(text))
    if (!d) return null
    const batches: EvBatch[] = d.batches.map((b: EvBatch) => ({
      id: String(b.id), name: String(b.name ?? ''), fileName: String(b.fileName ?? ''),
      accounts: (Array.isArray(b.accounts) ? b.accounts : []).map((a: EvAccount) => ({
        id: String(a.id), text: String(a.text ?? ''), checked: !!a.checked, failLabel: a.failLabel || '',
        special: !!a.special, exported: !!a.exported, exportBatchId: a.exportBatchId || '',
      })),
    }))
    const st = { ...initialState, ...d.state, batches, history: Array.isArray(d.history) ? d.history : [] }
    if (!batches.some(b => b.id === st.selectedId)) st.selectedId = batches[0]?.id ?? ''
    return st
  } catch (e) { return null }
}

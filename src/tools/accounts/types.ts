export type Status = 'farm' | 'special' | 'sold'
export type Tab = 'list' | 'farm' | 'special' | 'sold' | 'tools'
export type BatchFilter = 'all' | number
export type StatusFilter = 'all' | Status

export interface Account {
  id: number
  raw: string
  user: string
  batch: number
  status: Status
  inList: boolean
  note: string
  sale: string
  soldAt: number | null
  prev: Status
  addedAt: number
}

export interface Settings {
  chunk: number
  group: number
  crlf: boolean
  view: 'table' | 'text'
}

export interface BatchMeta { at: number; name: string }

export interface Store {
  v: number
  settings: Settings
  accounts: Account[]
  seq: number
  batchSeq: number
  batchMeta: Record<number, BatchMeta>
  tags: string[]
}

export interface Ctx {
  tab: Tab
  goTab: (t: Tab) => void
  sel: Set<number>
  setSel: (s: Set<number>) => void
  limit: number
  setLimit: (n: number) => void
  q: string
  setQ: (q: string) => void
  fb: BatchFilter
  setFb: (b: BatchFilter) => void
  fs: StatusFilter
  setFs: (s: StatusFilter) => void
  fn: Set<string>
  setFn: (s: Set<string>) => void
  visible: Account[]
  ordered: Account[]
  isNoteTab: boolean
  farmLock: Set<number> | null
  setFarmLock: (s: Set<number> | null) => void
  commit: () => void
  toast: (m: string) => void
}

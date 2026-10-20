import { useCallback, useMemo, useReducer, useState } from 'react'
import { S, save, byStatus, inListAccounts, noteOrder, PAGE } from './store'
import ListPage from './ListPage'
import ImportExport from './ImportExport'
import BatchSidebar from './BatchSidebar'
import { SubTabs } from '../../shared/components/Layout'
import type { SubTabItem } from '../../shared/components/Layout'
import type { Account, BatchFilter, Ctx, StatusFilter, Tab } from './types'

export default function AccountsTool({ toast }: { toast: (m: string) => void }) {
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<Tab>('farm')
  const [sel, setSel] = useState<Set<number>>(() => new Set())
  const [limit, setLimit] = useState(PAGE)
  const [q, setQ] = useState('')
  const [fb, setFb] = useState<BatchFilter>('all') // lọc batch
  const [fs, setFs] = useState<StatusFilter>('all') // lọc trạng thái (tab Danh sách)

  // dữ liệu nằm trong S (store.ts, thay đổi trực tiếp); commit = lưu + vẽ lại
  const commit = useCallback(() => { save(); bump() }, [])

  const inScope = (a: Account) => tab === 'list'
    ? (a.inList !== false && (fs === 'all' || a.status === fs))
    : a.status === tab

  const isNoteTab = tab === 'special' || tab === 'sold'
  const s = q.trim().toLowerCase()
  const visible = S.accounts.filter(a =>
    inScope(a) && (fb === 'all' || a.batch === fb) &&
    (!s || a.raw.toLowerCase().includes(s) || (a.note || '').toLowerCase().includes(s)))
  const ordered = isNoteTab ? noteOrder(visible) : visible

  // lựa chọn luôn là tập con của danh sách đang hiện
  const effSel = useMemo(() => {
    const visIds = new Set(visible.map(a => a.id))
    let changed = false
    const n = new Set<number>()
    sel.forEach(id => { if (visIds.has(id)) n.add(id); else changed = true })
    return changed ? n : sel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tab, q, fb, fs, S.accounts.length, visible.length])

  const goTab = (t: Tab) => { setTab(t); setLimit(PAGE); setSel(new Set()); setQ(''); window.scrollTo(0, 0) }

  const counts = {
    list: inListAccounts().length,
    farm: byStatus('farm').length,
    special: byStatus('special').length,
    sold: byStatus('sold').length,
  }
  const batchCount = (b: number) => S.accounts.filter(a => a.batch === b && inScope(a)).length
  const scopeCount = S.accounts.filter(inScope).length

  const ctx: Ctx = {
    tab, goTab, sel: effSel, setSel, limit, setLimit, q, setQ, fb, setFb, fs, setFs,
    visible, ordered, isNoteTab, commit, toast,
  }

  const items: SubTabItem<Tab>[] = [
    { id: 'list', label: 'Danh sách', count: counts.list },
    { id: 'farm', label: 'Farm', count: counts.farm },
    { id: 'special', label: 'Special', count: counts.special },
    { id: 'sold', label: 'Đã bán', count: counts.sold },
    { id: 'tools', label: 'Nhập và xuất' },
  ]

  return (
    <>
      <SubTabs items={items} value={tab} onChange={goTab} label="Khu vực quản lý account" />
      <div className={'acc-layout' + (tab === 'tools' ? ' solo' : '')}>
        {tab !== 'tools' && (
          <BatchSidebar fb={fb} setFb={b => { setFb(b); setLimit(PAGE) }} batchCount={batchCount} scopeCount={scopeCount} />
        )}
        <div className="acc-main">
          {tab === 'tools'
            ? <ImportExport ctx={ctx} onRestored={() => { setSel(new Set()); setFb('all'); setFs('all') }} />
            : <ListPage ctx={ctx} />}
        </div>
      </div>
    </>
  )
}

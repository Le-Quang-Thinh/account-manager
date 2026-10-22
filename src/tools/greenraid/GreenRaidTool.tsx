import { memo, useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch } from 'react'
import {
  BLOCK_SIZE, EXPORT_LIMIT, FAIL_LABELS, batchStats, failName, isComplete, lineOf, loadState, makeBatch,
  matchesStatus, outAccounts, planExport, reducer, saveState, summaryRows,
} from './logic'
import type { Action, EvAccount, EvBatch, EvState, ExportRecord, FailLabel, OutFilter, StatusFilter, SummaryFilter } from './logic'
import { pull, push } from './sync'
import type { Remote } from './sync'
import { copyText, download, readTextFile, withTxt } from '../../shared/lib/browser'

const pad = (n: number) => String(n).padStart(2, '0')
const exportName = () => {
  const d = new Date()
  return `success_1000_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.txt`
}

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' }, { id: 'todo', label: 'Chưa xử lý' }, { id: 'success', label: 'Success' },
  ...FAIL_LABELS.map(f => ({ id: f.id as StatusFilter, label: f.label })),
]
const SUMMARY_FILTERS: { id: SummaryFilter; label: string }[] = [
  { id: 'processed', label: 'Tất cả đã xử lý' }, { id: 'success', label: 'Success' },
  { id: 'special', label: 'Special' }, { id: 'fail', label: 'Lỗi' },
]
const OUT_FILTERS: { id: Exclude<OutFilter, null>; label: string }[] = [
  { id: 'success', label: 'Success' }, ...FAIL_LABELS.map(f => ({ id: f.id as Exclude<OutFilter, null>, label: f.label })),
]

function StatusTag({ a }: { a: EvAccount }) {
  if (!a.checked) return null
  return a.failLabel
    ? <span className={'ev-tag f-' + a.failLabel}>{failName(a.failLabel)}</span>
    : <span className="ev-tag f-ok">Success</span>
}

// ===== dòng account (memo: tick một dòng không vẽ lại cả danh sách) =====
const Row = memo(function Row({ a, no, batchId, dispatch, flash }: {
  a: EvAccount; no: number; batchId: string; dispatch: Dispatch<Action>; flash: boolean
}) {
  return (
    <div id={'ea-' + a.id} className={'ev-row' + (a.checked ? ' on' : '') + (flash ? ' flash' : '')}>
      <input type="checkbox" aria-label={'Tick ' + a.text} checked={a.checked}
        onChange={e => dispatch({ type: 'tick', batchId, ids: [a.id], checked: e.target.checked })} />
      <span className="ev-no">{no}</span>
      <span className="ev-acc" title={a.text}>{a.text}</span>
      <StatusTag a={a} />
      {a.special && <span className="ev-tag f-special">Special</span>}
      <select className="ev-sel" aria-label="Nhãn lỗi" disabled={!a.checked} value={a.failLabel}
        onChange={e => dispatch({ type: 'fail', batchId, id: a.id, label: e.target.value as '' | FailLabel })}>
        <option value="">Success</option>
        {FAIL_LABELS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <button type="button" className={'btn sm ev-sp' + (a.special ? ' on' : '')} aria-pressed={a.special}
        onClick={() => dispatch({ type: 'special', batchId, id: a.id })}>Special</button>
    </div>
  )
})

function BlockAll({ accs, batchId, index, dispatch }: { accs: EvAccount[]; batchId: string; index: number; dispatch: Dispatch<Action> }) {
  const n = accs.filter(a => a.checked).length
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = n > 0 && n < accs.length }, [n, accs.length])
  return (
    <div className="ev-block-h">
      <div><b>Nhóm {index + 1} · {accs.length} account</b><div className="dim">{n}/{accs.length} đã tick</div></div>
      <label className="ev-all">
        <input ref={ref} type="checkbox" checked={n === accs.length} aria-label={`Tick cả nhóm ${index + 1}`}
          onChange={e => dispatch({ type: 'tick', batchId, ids: accs.map(a => a.id), checked: e.target.checked })} />
        ALL {accs.length}
      </label>
    </div>
  )
}

// ===== cột trái =====
function Sidebar({ s, dispatch, toast }: { s: EvState; dispatch: Dispatch<Action>; toast: (m: string) => void }) {
  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    try {
      const texts = await Promise.all(files.map(readTextFile))
      const batches = files.map((f, i) => makeBatch(f.name, texts[i])).filter(b => b.accounts.length)
      if (batches.length < files.length) toast(`Bỏ ${files.length - batches.length} file rỗng`)
      dispatch({ type: 'import', batches })
    } catch (err) { toast('Không đọc được file. Hãy chọn file .txt') }
  }
  const rename = (b: EvBatch) => {
    const name = window.prompt('Tên batch mới', b.name)
    if (name !== null) dispatch({ type: 'rename', id: b.id, name })
  }
  const remove = (b: EvBatch) => {
    if (window.confirm(`Xóa batch "${b.name}" (${b.accounts.length} account)? Không hoàn tác được.`)) dispatch({ type: 'delete', id: b.id })
  }
  const done = s.batches.filter(isComplete)
  const active = s.batches.filter(b => !isComplete(b))
  const list = s.leftTab === 'active' ? active : done
  return (
    <aside className="pane ev-col">
      <div className="pane-h"><h3>Event Batches</h3></div>
      <div className="ev-pad">
        <label className="btn teal ev-import">Import TXT Batch
          <input type="file" accept=".txt,text/plain" multiple hidden onChange={onImport} />
        </label>
        <div className="ev-tabs" role="tablist" aria-label="Nhóm batch">
          <button type="button" role="tab" aria-selected={s.leftTab === 'active'} className={s.leftTab === 'active' ? 'on' : ''}
            onClick={() => dispatch({ type: 'ui', patch: { leftTab: 'active' } })}>Đang quản lý <i>{active.length}</i></button>
          <button type="button" role="tab" aria-selected={s.leftTab === 'done'} className={s.leftTab === 'done' ? 'on' : ''}
            onClick={() => dispatch({ type: 'ui', patch: { leftTab: 'done' } })}>Đã thành công <i>{done.length}</i></button>
        </div>
      </div>
      <div className="ev-list">
        {list.length === 0 && <p className="pane-empty">{s.batches.length ? 'Không có batch nào ở tab này.' : 'Chưa có batch. Hãy import file TXT.'}</p>}
        {list.map(b => {
          const st = batchStats(b)
          return (
            <div key={b.id} className={'ev-batch' + (b.id === s.selectedId && s.view === 'batch' ? ' on' : '')}>
              <button type="button" className="ev-batch-main" onClick={() => dispatch({ type: 'ui', patch: { selectedId: b.id, view: 'batch', search: '', filter: 'all' } })}>
                <b>{b.name}</b>
                <span className="ev-stats">
                  <span>{st.total} acc</span>
                  <span className="c-ok">✓ {st.success}</span>
                  <span className="c-bad">⚠ {st.fail}</span>
                  <span>Todo {st.todo}</span>
                </span>
              </button>
              <button type="button" className="btn sm ghost" onClick={() => rename(b)}>Đổi tên</button>
              <button type="button" className="btn sm ghost danger" aria-label={'Xóa ' + b.name} onClick={() => remove(b)}>Xóa</button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ===== màn Batch hiện tại =====
function BatchView({ s, batch, dispatch, flashId }: { s: EvState; batch: EvBatch; dispatch: Dispatch<Action>; flashId: string }) {
  const search = useDeferredValue(s.search)
  const st = batchStats(batch)
  const fails = FAIL_LABELS.map(f => ({ ...f, n: batch.accounts.filter(a => !a.exported && a.checked && a.failLabel === f.id).length }))
  // khối 20 chia theo vị trí trong batch (không phụ thuộc bộ lọc); bộ lọc chỉ ẩn dòng
  const { blocks, count } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const live = batch.accounts.filter(a => !a.exported)
    const out: { all: EvAccount[]; shown: { a: EvAccount; no: number }[] }[] = []
    let count = 0
    for (let i = 0; i < live.length; i += BLOCK_SIZE) {
      const all = live.slice(i, i + BLOCK_SIZE)
      const shown = all.map((a, k) => ({ a, no: k + 1 })).filter(({ a }) => matchesStatus(a, s.filter) && (!q || a.text.toLowerCase().includes(q)))
      count += shown.length
      out.push({ all, shown })
    }
    return { blocks: out, count }
  }, [batch, search, s.filter])
  const rename = () => {
    const name = window.prompt('Tên batch mới', batch.name)
    if (name !== null) dispatch({ type: 'rename', id: batch.id, name })
  }
  return (
    <>
      <div className="ev-head">
        <h2>{batch.name}</h2>
        <span className="sp" />
        <button type="button" className="btn sm" onClick={rename}>Đổi tên</button>
        <button type="button" className="btn sm teal" onClick={() => dispatch({ type: 'tickAll', batchId: batch.id, checked: true })}>Tick tất cả</button>
        <button type="button" className="btn sm" onClick={() => dispatch({ type: 'tickAll', batchId: batch.id, checked: false })}>Bỏ tick</button>
      </div>
      <div className="ev-cards">
        <div className="ev-card"><b>{st.total}</b>Total</div>
        <div className="ev-card f-ok"><b>{st.success}</b>Success</div>
        {fails.map(f => <div key={f.id} className={'ev-card f-' + f.id}><b>{f.n}</b>{f.label}</div>)}
      </div>
      <div className="ev-tools">
        <input className="inp grow" type="search" placeholder="Tìm account trong batch…" aria-label="Tìm account" value={s.search}
          onChange={e => dispatch({ type: 'ui', patch: { search: e.target.value } })} />
        <select className="inp" aria-label="Lọc trạng thái" value={s.filter} onChange={e => dispatch({ type: 'ui', patch: { filter: e.target.value as StatusFilter } })}>
          {STATUS_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <span className="dim">{count} dòng</span>
      </div>
      {blocks.map((blk, bi) => (
        <section key={blk.all[0].id} className="ev-block">
          <BlockAll accs={blk.all} batchId={batch.id} index={bi} dispatch={dispatch} />
          {blk.shown.length === 0 && <div className="dim ev-none">Không có account phù hợp bộ lọc trong nhóm này.</div>}
          {blk.shown.map(({ a, no }) => <Row key={a.id} a={a} no={no} batchId={batch.id} dispatch={dispatch} flash={a.id === flashId} />)}
        </section>
      ))}
    </>
  )
}

// ===== màn Tổng hợp =====
function SummaryView({ s, dispatch, onOpen }: { s: EvState; dispatch: Dispatch<Action>; onOpen: (batchId: string, accId: string) => void }) {
  const stats = useMemo(() => {
    let total = 0, success = 0, special = 0, fail = 0, todo = 0
    for (const b of s.batches) for (const a of b.accounts) {
      if (a.exported) continue
      total++
      if (a.special) special++
      if (!a.checked) todo++
      else if (a.failLabel) fail++
      else success++
    }
    return { total, success, special, fail, todo }
  }, [s.batches])
  const rows = useMemo(() => summaryRows(s.batches, s.summaryFilter), [s.batches, s.summaryFilter])
  const shown = rows.slice(0, 500)
  return (
    <>
      <div className="ev-cards five">
        <div className="ev-card"><b>{stats.total}</b>Total</div>
        <div className="ev-card f-ok"><b>{stats.success}</b>Success</div>
        <div className="ev-card f-special"><b>{stats.special}</b>Special</div>
        <div className="ev-card f-fail_raid"><b>{stats.fail}</b>Lỗi</div>
        <div className="ev-card"><b>{stats.todo}</b>Chưa xử lý</div>
      </div>
      <div className="ev-tools">
        <select className="inp" aria-label="Lọc tổng hợp" value={s.summaryFilter} onChange={e => dispatch({ type: 'ui', patch: { summaryFilter: e.target.value as SummaryFilter } })}>
          {SUMMARY_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <span className="dim">{rows.length} dòng{rows.length > shown.length && ` (hiện ${shown.length} dòng đầu)`}</span>
      </div>
      {rows.length === 0 && <p className="pane-empty">Không có account nào khớp.</p>}
      <div className="ev-block">
        {shown.map(r => (
          <div key={r.acc.id} className="ev-row sum">
            <span className="ev-acc" title={r.acc.text}>{r.acc.text}</span>
            <StatusTag a={r.acc} />
            {r.acc.special && <span className="ev-tag f-special">Special</span>}
            <span className="dim ev-src">Batch {r.batchNo}: {r.batch.name} · Account {r.accNo}</span>
            <button type="button" className="btn sm" onClick={() => onOpen(r.batch.id, r.acc.id)}>Mở batch</button>
          </div>
        ))}
      </div>
    </>
  )
}

// ===== cột phải =====
function ExportPanel({ s, dispatch, toast }: { s: EvState; dispatch: Dispatch<Action>; toast: (m: string) => void }) {
  const plan = useMemo(() => planExport(s.batches), [s.batches])
  const [override, setOverride] = useState<{ text: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  const auto = useMemo(() => {
    if (s.outFilter) return outAccounts(s.batches, s.outFilter)
    if (s.view === 'summary') return summaryRows(s.batches, s.summaryFilter).map(r => r.acc)
    return []
  }, [s.batches, s.outFilter, s.view, s.summaryFilter])
  const text = override ? override.text : auto.map(lineOf).join('\n')
  const lineCount = text ? text.split('\n').length : 0
  const defaultName = override?.name.replace(/\.txt$/i, '') || (s.outFilter ?? 'ket_qua')

  const pickFilter = (f: Exclude<OutFilter, null>) => {
    setOverride(null)
    dispatch({ type: 'ui', patch: { outFilter: s.outFilter === f ? null : f } })
  }
  const copy = () => {
    if (!text) return
    copyText(text).then(() => toast(`Đã copy ${lineCount} dòng`)).catch(() => {
      taRef.current?.select()
      toast('Trình duyệt chặn clipboard. Đã bôi đen sẵn, hãy bấm Ctrl+C')
    })
  }
  const exportNow = () => {
    if (!plan.picked.length) return
    const fileName = exportName()
    const record = { id: `ex-${Date.now().toString(36)}`, name: fileName, count: plan.picked.length, createdAt: Date.now() }
    download(fileName, plan.picked.map(a => a.text).join('\n'))
    dispatch({ type: 'export', ids: new Set(plan.picked.map(a => a.id)), record })
    toast(`Đã xuất ${record.count} account${plan.dupes ? `, bỏ ${plan.dupes} trùng` : ''}`)
  }
  const view = (id: string, fileName: string) => {
    const lines: string[] = []
    for (const b of s.batches) for (const a of b.accounts) if (a.exportBatchId === id) lines.push(a.text)
    dispatch({ type: 'ui', patch: { outFilter: null } })
    setOverride({ text: lines.join('\n'), name: fileName })
    setName(fileName.replace(/\.txt$/i, ''))
  }

  return (
    <aside className="pane ev-col">
      <div className="pane-h"><h3>Output / Export</h3></div>
      <div className="ev-pad">
        <div className="ev-chips">
          {OUT_FILTERS.map(f => (
            <button key={f.id} type="button" aria-pressed={s.outFilter === f.id}
              className={'ev-chip f-' + (f.id === 'success' ? 'ok' : f.id) + (s.outFilter === f.id ? ' on' : '')} onClick={() => pickFilter(f.id)}>{f.label}</button>
          ))}
        </div>
        <div className="ev-out-bar">
          <span className="dim">{lineCount} dòng</span>
          <span className="sp" />
          <button type="button" className="btn sm" disabled={!text} onClick={copy}>Copy</button>
        </div>
        <textarea ref={taRef} className="ta-pane out ev-ta" readOnly wrap="off" spellCheck={false} aria-label="Kết quả" value={text}
          placeholder="Chọn bộ lọc ở trên để xem kết quả…" />
        <div className="ev-file">
          <input className="inp" type="text" placeholder={defaultName} aria-label="Tên file" value={name} onChange={e => setName(e.target.value)} />
          <button type="button" className="btn sm solid" disabled={!text} onClick={() => download(withTxt(name, defaultName), text)}>Tải về</button>
        </div>
      </div>

      <div className="ev-export">
        <div className="ev-tabs ex" role="tablist" aria-label="Xuất 1000">
          <button type="button" role="tab" aria-selected={s.exportTab === 'ready'} className={s.exportTab === 'ready' ? 'on' : ''}
            onClick={() => dispatch({ type: 'ui', patch: { exportTab: 'ready' } })}>Xuất {EXPORT_LIMIT}</button>
          <button type="button" role="tab" aria-selected={s.exportTab === 'done'} className={s.exportTab === 'done' ? 'on' : ''}
            onClick={() => dispatch({ type: 'ui', patch: { exportTab: 'done' } })}>Đã xuất <i>{s.history.length}</i></button>
        </div>
        {s.exportTab === 'ready' ? (
          <div className="ev-ex-body">
            <p className="ev-ready"><b>{plan.picked.length}</b>/{EXPORT_LIMIT} sẵn sàng{plan.dupes > 0 && <span className="c-bad"> · bỏ {plan.dupes} trùng</span>}</p>
            <p className="dim">Chỉ lấy account đã tick, không lỗi, không Special, chưa xuất; bỏ dòng trùng.</p>
            <button type="button" className="btn solid ev-go" disabled={!plan.picked.length} onClick={exportNow}>Xuất & tải file</button>
          </div>
        ) : (
          <div className="ev-ex-body">
            {s.history.length === 0 && <p className="dim">Chưa có lần xuất nào.</p>}
            {s.history.map(h => (
              <div key={h.id} className="ev-hist">
                <span className="ev-hist-n" title={h.name}>{h.name}<br /><span className="dim">{h.count} account · {new Date(h.createdAt).toLocaleString('vi-VN')}</span></span>
                <button type="button" className="btn sm" onClick={() => view(h.id, h.name)}>Xem</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}

export default function GreenRaidTool({ toast }: { toast: (m: string) => void }) {
  const [s, dispatch] = useReducer(reducer, undefined, loadState)
  const [flashId, setFlashId] = useState('')
  const warned = useRef(false)
  const [ready, setReady] = useState(false)
  const [sync, setSync] = useState<'saved' | 'saving' | 'error' | 'local'>('local')
  const sRef = useRef(s)
  sRef.current = s
  const rev = useRef(0)
  const online = useRef(false) // server dùng được
  const synced = useRef<{ b: EvBatch[]; h: ExportRecord[] } | null>(null) // bản đã chắc chắn có trên server
  const busy = useRef(false)

  const adopt = useCallback((r: Remote) => {
    rev.current = r.rev
    synced.current = { b: r.batches, h: r.history }
    const cur = sRef.current
    dispatch({ type: 'replace', state: { ...cur, batches: r.batches, history: r.history,
      selectedId: r.batches.some(b => b.id === cur.selectedId) ? cur.selectedId : (r.batches[0]?.id ?? '') } })
  }, [])

  // nạp từ server; lần đầu server còn trống mà trình duyệt có dữ liệu cũ thì đẩy lên
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    pull().then(async r => {
      online.current = true
      if (r) adopt(r)
      else {
        const cur = sRef.current
        if (cur.batches.length || cur.history.length) {
          const p = await push(0, cur.batches, cur.history)
          if (p.ok) { rev.current = p.rev; synced.current = { b: cur.batches, h: cur.history } }
        } else synced.current = { b: cur.batches, h: cur.history }
      }
      setSync('saved')
      setReady(true)
    }).catch(() => { setSync('local'); setReady(true) })
  }, [adopt])

  const flush = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      for (;;) {
        const cur = sRef.current
        if (cur.batches === synced.current?.b && cur.history === synced.current?.h) { setSync('saved'); break }
        setSync('saving')
        const r = await push(rev.current, cur.batches, cur.history)
        if (r.ok) { rev.current = r.rev; synced.current = { b: cur.batches, h: cur.history }; continue }
        if (r.unauthorized) { window.alert('Phiên đăng nhập đã hết hạn, trang sẽ tải lại để đăng nhập.'); location.reload(); return }
        if (r.conflict) {
          if (window.confirm('Dữ liệu event đã được sửa ở máy/tab khác.\nOK = tải lại từ server (bỏ thay đổi chưa lưu ở tab này).\nHủy = ghi đè bằng dữ liệu ở tab này.')) {
            const fresh = await pull().catch(() => null)
            if (fresh) adopt(fresh)
            setSync('saved')
            break
          }
          rev.current = r.rev ?? rev.current
          continue
        }
        setSync('error')
        break
      }
    } finally { busy.current = false }
  }, [adopt])

  // lưu sau khi dừng thao tác một chút để tick liên tục không ghi mỗi lần
  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => {
      if (!saveState(s) && !warned.current && !online.current) { warned.current = true; toast('Không lưu được dữ liệu vào trình duyệt (đầy bộ nhớ hoặc bị chặn)') }
    }, 400)
    return () => clearTimeout(t)
  }, [s, toast, ready])

  useEffect(() => {
    if (!ready || !online.current) return
    if (s.batches === synced.current?.b && s.history === synced.current?.h) return
    const t = window.setTimeout(flush, 800)
    return () => clearTimeout(t)
  }, [s.batches, s.history, ready, flush]) // eslint-disable-line react-hooks/exhaustive-deps

  // quay lại tab: nếu không có thay đổi chưa lưu thì lấy bản mới (vd. vừa import file qua Telegram)
  useEffect(() => {
    if (!ready) return
    const unsaved = () => sRef.current.batches !== synced.current?.b || sRef.current.history !== synced.current?.h
    const refresh = async () => {
      if (document.hidden || !online.current || busy.current || unsaved()) return
      const r = await pull().catch(() => null)
      if (!r || r.rev === rev.current || busy.current || unsaved()) return
      adopt(r)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [ready, adopt])

  // cảnh báo khi đóng tab lúc còn thay đổi chưa lên server
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (online.current && (sRef.current.batches !== synced.current?.b || sRef.current.history !== synced.current?.h)) e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  const batch = s.batches.find(b => b.id === s.selectedId) ?? null

  // nhảy tới đúng dòng sau khi màn batch đã vẽ
  useEffect(() => {
    if (!flashId || s.view !== 'batch') return
    document.getElementById('ea-' + flashId)?.scrollIntoView({ block: 'center' })
    const t = window.setTimeout(() => setFlashId(''), 2200)
    return () => clearTimeout(t)
  }, [flashId, s.view])

  const openAt = useCallback((batchId: string, accId: string) => {
    dispatch({ type: 'ui', patch: { selectedId: batchId, view: 'batch', search: '', filter: 'all' } })
    setFlashId(accId)
  }, [])

  return (
    <div className="ev">
      <div className="ev-top">
        <h1>Quản lý event</h1>
        <p className="sub">Tick account đã xử lý, gán nhãn lỗi, đánh dấu Special rồi xuất {EXPORT_LIMIT} account Success.
          {' '}<span className="dim">{{ saved: '· Đã lưu lên server', saving: '· Đang lưu…', error: '· Chưa lưu được lên server, sẽ thử lại khi có thay đổi', local: '· Chỉ lưu trên máy này' }[sync]}</span></p>
      </div>
      {!ready ? <p className="pane-empty">Đang tải dữ liệu…</p> : (
      <div className="ev-layout">
        <Sidebar s={s} dispatch={dispatch} toast={toast} />
        <section className="pane ev-col ev-mid">
          <div className="ev-tabs top" role="tablist" aria-label="Màn hình">
            <button type="button" role="tab" aria-selected={s.view === 'batch'} className={s.view === 'batch' ? 'on' : ''}
              onClick={() => dispatch({ type: 'ui', patch: { view: 'batch' } })}>Batch hiện tại</button>
            <button type="button" role="tab" aria-selected={s.view === 'summary'} className={s.view === 'summary' ? 'on' : ''}
              onClick={() => dispatch({ type: 'ui', patch: { view: 'summary' } })}>Tổng hợp tất cả</button>
          </div>
          <div className="ev-pad">
            {s.view === 'summary'
              ? <SummaryView s={s} dispatch={dispatch} onOpen={openAt} />
              : batch ? <BatchView s={s} batch={batch} dispatch={dispatch} flashId={flashId} />
                : <p className="pane-empty">Chọn hoặc import một batch để bắt đầu.</p>}
          </div>
        </section>
        <ExportPanel s={s} dispatch={dispatch} toast={toast} />
      </div>)}
    </div>
  )
}

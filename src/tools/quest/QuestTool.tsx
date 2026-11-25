import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  DAYS, STAGE_LABEL, batchDone, batchProgress, cardDone, earliest, fmtDay, fmtFull,
  isReady, loadState, makeBatch, needToday, reducer, saveState, stage, toCSV, todayStr,
} from './logic'
import type { QuestBatch, QuestCard, Stage } from './logic'
import { Icon } from '../../shared/components/Icon'
import { download, readTextFile, stamp } from '../../shared/lib/browser'

type Filter = 'today' | 'all' | 'ready' | 'done'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'today', label: 'Cần bắt hôm nay' }, { id: 'all', label: 'Tất cả' },
  { id: 'ready', label: 'Sẵn sàng nhận' }, { id: 'done', label: 'Hoàn tất' },
]

function Dots({ c }: { c: QuestCard }) {
  return (
    <span className="q-dots" title={`${c.catchDays.length}/${DAYS} ngày`} aria-label={`${c.catchDays.length} trên ${DAYS} ngày`}>
      {Array.from({ length: DAYS }, (_, i) => <i key={i} className={i < c.catchDays.length ? 'on' : ''} />)}
      <b>{c.catchDays.length}/{DAYS}</b>
    </span>
  )
}

const Pill = ({ st }: { st: Stage }) => <span className={'q-st s-' + st}>{STAGE_LABEL[st]}</span>

export default function QuestTool({ toast, userKey }: { toast: (m: string) => void; userKey: string }) {
  const [s, dispatch] = useReducer(reducer, userKey, loadState)
  const [filter, setFilter] = useState<Filter>('today')
  const [selBatch, setSelBatch] = useState<string>('all') // 'all' = mọi đợt đang làm, hoặc id một đợt
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [openId, setOpenId] = useState('') // thẻ đang mở chi tiết
  const [history, setHistory] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const warned = useRef(false)
  const today = todayStr()

  // lưu localStorage sau khi dừng thao tác một chút
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!saveState(s, userKey) && !warned.current) { warned.current = true; toast('Không lưu được vào trình duyệt (đầy bộ nhớ hoặc bị chặn).') }
    }, 350)
    return () => clearTimeout(t)
  }, [s, userKey, toast])

  const activeBatches = useMemo(() => s.batches.filter(b => !batchDone(b)), [s.batches])
  const doneBatches = useMemo(() => s.batches.filter(batchDone), [s.batches])

  // phạm vi: 'all' = mọi đợt đang làm; id cụ thể = đúng đợt đó (kể cả đợt đã xong trong lịch sử)
  const scopeBatches = selBatch === 'all' ? activeBatches : s.batches.filter(b => b.id === selBatch)
  const scopeCards = useMemo(
    () => scopeBatches.flatMap(b => b.cards.map(card => ({ batch: b, card }))),
    [scopeBatches],
  )

  const counts = useMemo(() => {
    let done = 0, need = 0, ready = 0
    for (const { card } of scopeCards) {
      if (cardDone(card)) done++
      else { if (needToday(card, today)) need++; if (isReady(card)) ready++ }
    }
    return { total: scopeCards.length, done, need, ready, doing: scopeCards.length - done }
  }, [scopeCards, today])

  // danh sách hiển thị theo bộ lọc + tìm kiếm
  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return scopeCards.filter(({ card }) => {
      if (kw && !card.text.toLowerCase().includes(kw)) return false
      if (filter === 'today') return needToday(card, today)
      if (filter === 'ready') return isReady(card)
      if (filter === 'done') return cardDone(card)
      return true
    })
  }, [scopeCards, filter, q, today])

  const listIds = useMemo(() => list.map(x => x.card.id), [list])
  const selN = listIds.reduce((n, id) => n + (sel.has(id) ? 1 : 0), 0)
  const allSel = listIds.length > 0 && selN === listIds.length

  const toggleSel = (ids: string[], on: boolean) => {
    const n = new Set(sel)
    ids.forEach(id => (on ? n.add(id) : n.delete(id)))
    setSel(n)
  }
  const clearSel = () => setSel(new Set())

  // ===== hành động =====
  const needIdsInScope = () => scopeCards.filter(({ card }) => needToday(card, today)).map(x => x.card.id)
  const readyIdsInScope = () => scopeCards.filter(({ card }) => isReady(card)).map(x => x.card.id)

  const catchAllToday = () => {
    const ids = needIdsInScope()
    if (!ids.length) { toast('Hôm nay không còn thẻ nào cần bắt.'); return }
    dispatch({ type: 'catch', ids })
    toast(`Đã đánh dấu bắt hôm nay cho ${ids.length} thẻ.${s.autoClaim ? ' Thẻ đủ 5 ngày đã tự nhận.' : ''}`)
  }
  const claimAll = () => {
    const ids = readyIdsInScope()
    if (!ids.length) { toast('Chưa có thẻ nào sẵn sàng nhận.'); return }
    dispatch({ type: 'claim', ids })
    clearSel()
    toast(`Đã nhận ${ids.length} thẻ.`)
  }
  const catchSel = () => { const ids = [...sel]; dispatch({ type: 'catch', ids }); toast(`Đã bắt hôm nay cho ${ids.length} thẻ đã chọn.`) }
  const claimSel = () => { const ids = [...sel]; dispatch({ type: 'claim', ids }); clearSel(); toast(`Đã nhận các thẻ đủ điều kiện trong ${ids.length} thẻ đã chọn.`) }
  const undoSel = () => { const ids = [...sel]; dispatch({ type: 'undoCatch', ids }); toast('Đã hoàn tác bắt hôm nay cho các thẻ đã chọn.') }

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    try {
      const texts = await Promise.all(files.map(readTextFile))
      let n = 0
      files.forEach((f, i) => {
        const b = makeBatch(f.name, texts[i])
        if (b.cards.length) { dispatch({ type: 'import', batch: b }); n += b.cards.length }
      })
      if (n) { setFilter('today'); toast(`Đã tạo đợt mới với ${n} thẻ.`) }
      else toast('File rỗng, không có dòng account nào.')
    } catch { toast('Không đọc được file. Hãy chọn file .txt') }
  }

  const exportCSV = () => {
    if (!scopeCards.length) { toast('Không có thẻ nào để xuất.'); return }
    download(`quest-${stamp()}.csv`, toCSV(scopeCards.map(({ batch, card }) => ({ batch: batch.name, card }))), 'text/csv;charset=utf-8')
    toast(`Đã xuất ${scopeCards.length} thẻ ra CSV.`)
  }

  const renameBatch = (b: QuestBatch) => {
    const name = window.prompt('Tên đợt mới', b.name)
    if (name !== null) dispatch({ type: 'rename', id: b.id, name: name.trim() || b.name })
  }
  const deleteBatch = (b: QuestBatch) => {
    if (window.confirm(`Xóa đợt "${b.name}" (${b.cards.length} thẻ)? Không hoàn tác được.`)) {
      dispatch({ type: 'deleteBatch', id: b.id })
      if (selBatch === b.id) setSelBatch('all')
      toast('Đã xóa đợt.')
    }
  }

  const rowAction = (c: QuestCard) => {
    if (cardDone(c)) return <span className="q-done-tag"><Icon name="check" size={13} />Hoàn tất</span>
    if (isReady(c)) return <button className="btn star" onClick={() => dispatch({ type: 'claim', ids: [c.id] })}><Icon name="star" size={13} />Nhận thẻ</button>
    if (needToday(c, today)) return <button className="btn teal" onClick={() => dispatch({ type: 'catch', ids: [c.id] })}><Icon name="check" size={13} />Bắt hôm nay</button>
    // đã bắt hôm nay, chưa đủ 5 ngày
    return <span className="q-today-tag">✓ đã bắt hôm nay<button className="btn ghost sm" onClick={() => dispatch({ type: 'undoCatch', ids: [c.id] })}>Hoàn tác</button></span>
  }

  const selectedBatchObj = selBatch !== 'all' ? s.batches.find(b => b.id === selBatch) : null

  // ===== thẻ chi tiết (mở rộng) =====
  const Detail = ({ c }: { c: QuestCard }) => (
    <div className="q-detail">
      <div className="q-detail-days">
        <span className="q-detail-lb">Ngày đã bắt ({c.catchDays.length}/{DAYS}):</span>
        {c.catchDays.length === 0 && <span className="dim">chưa có</span>}
        {[...c.catchDays].sort().map(d => (
          <span key={d} className="q-day">{fmtDay(d)}<button aria-label={`Bỏ ngày ${fmtDay(d)}`} onClick={() => dispatch({ type: 'removeDay', id: c.id, day: d })}>×</button></span>
        ))}
        {!cardDone(c) && !isReady(c) && earliest(c, today) && <span className="dim">· xong sớm nhất {fmtDay(earliest(c, today)!)}</span>}
      </div>
      <div className="q-detail-row">
        <input className="inp q-note" placeholder="Ghi chú…" value={c.note} onChange={e => dispatch({ type: 'note', id: c.id, note: e.target.value })} />
        {c.claimed
          ? <button className="btn sm" onClick={() => dispatch({ type: 'unclaim', ids: [c.id] })}>Bỏ nhận thẻ</button>
          : isReady(c) && <button className="btn sm star" onClick={() => dispatch({ type: 'claim', ids: [c.id] })}>Nhận thẻ</button>}
        <button className="btn sm ghost danger" onClick={() => { if (window.confirm('Xóa thẻ này khỏi đợt?')) dispatch({ type: 'deleteCard', id: c.id }) }}>Xóa thẻ</button>
      </div>
    </div>
  )

  return (
    <div className="quest">
      <header className="head">
        <div>
          <h1>Làm quest</h1>
          <p className="sub">Hôm nay <b>{fmtFull(Date.now())}</b>{selectedBatchObj ? ` · ${selectedBatchObj.name} (bắt đầu ${fmtFull(selectedBatchObj.createdAt)})` : ''}</p>
        </div>
        <div className="head-c">
          <label className="q-auto"><input type="checkbox" checked={s.autoClaim} onChange={e => dispatch({ type: 'autoClaim', on: e.target.checked })} />Tự nhận thẻ khi đủ 5 ngày</label>
          <div className="seg" role="group" aria-label="Kiểu hiển thị">
            <button className={s.view === 'list' ? 'on' : ''} aria-pressed={s.view === 'list'} onClick={() => dispatch({ type: 'view', view: 'list' })}>Danh sách</button>
            <button className={s.view === 'grid' ? 'on' : ''} aria-pressed={s.view === 'grid'} onClick={() => dispatch({ type: 'view', view: 'grid' })}>Lưới</button>
          </div>
          <button className="btn" onClick={exportCSV}><Icon name="download" size={14} />Xuất CSV</button>
          <label className="btn teal q-import"><Icon name="upload" size={14} />Import file
            <input ref={fileRef} type="file" accept=".txt,text/plain" multiple hidden onChange={onImport} />
          </label>
        </div>
      </header>

      {/* chọn đợt */}
      {s.batches.length > 0 && (
        <div className="q-batches" role="group" aria-label="Chọn đợt">
          <button className={'q-chip' + (selBatch === 'all' ? ' on' : '')} onClick={() => setSelBatch('all')}>Tất cả đợt đang làm ({activeBatches.length})</button>
          {activeBatches.map(b => (
            <button key={b.id} className={'q-chip' + (selBatch === b.id ? ' on' : '')} onClick={() => setSelBatch(b.id)}>
              {b.name} · {batchProgress(b)}/{b.cards.length}
            </button>
          ))}
          {doneBatches.length > 0 && <button className="q-chip ghost" onClick={() => setHistory(h => !h)} aria-expanded={history}>Lịch sử ({doneBatches.length}) {history ? '▴' : '▾'}</button>}
        </div>
      )}
      {history && doneBatches.length > 0 && (
        <div className="q-batches hist" role="group" aria-label="Đợt đã xong">
          {doneBatches.map(b => (
            <button key={b.id} className={'q-chip done' + (selBatch === b.id ? ' on' : '')} onClick={() => setSelBatch(b.id)}>
              ✔ {b.name} · {b.cards.length} thẻ · {fmtFull(b.createdAt)}
            </button>
          ))}
        </div>
      )}

      {s.batches.length === 0 ? (
        <div className="empty">
          <h2>Chưa có đợt quest nào</h2>
          <p>Import file account (.txt), mỗi dòng là một thẻ, để bắt đầu một đợt mới.</p>
          <button className="btn teal" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} />Import file account</button>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="acc-sum" role="group" aria-label="Tóm tắt">
            <div className="sum-card"><span className="sum-n">{counts.total}</span><span className="sum-l">Tổng thẻ</span></div>
            <div className="sum-card s-sold"><span className="sum-n">{counts.done}</span><span className="sum-l">Hoàn tất</span></div>
            <div className="sum-card s-farm"><span className="sum-n">{counts.need}</span><span className="sum-l">Cần bắt hôm nay</span></div>
            <div className="sum-card s-special"><span className="sum-n">{counts.ready}</span><span className="sum-l">Sẵn sàng nhận</span></div>
          </div>

          {/* banner hành động hằng ngày */}
          {counts.need > 0 && (
            <div className="q-banner">
              <span>⚡ Hôm nay còn <b>{counts.need}</b> thẻ cần bắt pkm</span>
              <button className="btn teal" onClick={catchAllToday}><Icon name="check" size={14} />Bắt tất cả {counts.need} hôm nay</button>
            </div>
          )}
          {counts.ready > 0 && (
            <div className="q-banner ready">
              <span>★ <b>{counts.ready}</b> thẻ đủ 5 ngày, sẵn sàng nhận</span>
              <button className="btn star" onClick={claimAll}><Icon name="star" size={14} />Nhận hết {counts.ready} thẻ</button>
            </div>
          )}

          {/* lọc + tìm */}
          <div className="q-toolbar">
            <div className="subtabs" role="group" aria-label="Lọc">
              {FILTERS.map(f => {
                const n = f.id === 'today' ? counts.need : f.id === 'ready' ? counts.ready : f.id === 'done' ? counts.done : counts.total
                return (
                  <button key={f.id} className={filter === f.id ? 'on' : ''} aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); clearSel() }}>
                    {f.label}<span className="subtabs-n">{n}</span>
                  </button>
                )
              })}
            </div>
            <input className="search" type="search" placeholder="Tìm account…" aria-label="Tìm account" value={q} onChange={e => setQ(e.target.value)} />
            {selectedBatchObj && (
              <>
                <button className="btn sm" onClick={() => renameBatch(selectedBatchObj)}>Đổi tên đợt</button>
                <button className="btn sm ghost danger" onClick={() => deleteBatch(selectedBatchObj)}>Xóa đợt</button>
              </>
            )}
          </div>

          {/* thanh chọn hàng loạt */}
          {sel.size > 0 && (
            <div className="q-bulk">
              <span><b>{sel.size}</b> đã chọn</span>
              <button className="btn teal sm" onClick={catchSel}>Bắt hôm nay</button>
              <button className="btn star sm" onClick={claimSel}>Nhận thẻ</button>
              <button className="btn sm" onClick={undoSel}>Hoàn tác bắt hôm nay</button>
              <button className="btn ghost sm" onClick={clearSel}>Bỏ chọn</button>
            </div>
          )}

          {list.length === 0 ? (
            <p className="count-end">{filter === 'today' ? 'Hôm nay không còn thẻ cần bắt trong phạm vi này. 🎉' : 'Không có thẻ nào khớp bộ lọc.'}</p>
          ) : s.view === 'grid' ? (
            <div className="q-grid">
              {list.map(({ card }) => {
                const st = stage(card, today)
                return (
                  <div key={card.id} className={'q-card s-' + st}>
                    <div className="q-card-h"><span className="q-acc" title={card.text}>{card.text}</span><Pill st={st} /></div>
                    <Dots c={card} />
                    <div className="q-card-act">{rowAction(card)}</div>
                    {!cardDone(card) && !isReady(card) && earliest(card, today) && <span className="dim q-eta">xong sớm nhất {fmtDay(earliest(card, today)!)}</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="q-list">
              <div className="q-row q-head-row">
                <label className="cb"><input type="checkbox" checked={allSel} aria-label="Chọn tất cả" ref={el => { if (el) el.indeterminate = selN > 0 && !allSel }} onChange={e => toggleSel(listIds, e.target.checked)} /></label>
                <span>Account</span><span>Ngày</span><span>Trạng thái</span><span className="q-c-act">Hôm nay</span>
              </div>
              {list.map(({ card }) => {
                const st = stage(card, today)
                const open = openId === card.id
                return (
                  <div key={card.id} className={'q-item' + (open ? ' open' : '')}>
                    <div className={'q-row s-' + st}>
                      <label className="cb"><input type="checkbox" checked={sel.has(card.id)} aria-label={`Chọn ${card.text}`} onChange={e => toggleSel([card.id], e.target.checked)} /></label>
                      <button className="q-acc q-acc-btn" title="Bấm để xem chi tiết" aria-expanded={open} onClick={() => setOpenId(open ? '' : card.id)}>{card.text}</button>
                      <Dots c={card} />
                      <Pill st={st} />
                      <span className="q-c-act">{rowAction(card)}</span>
                    </div>
                    {open && <Detail c={card} />}
                  </div>
                )
              })}
            </div>
          )}

          <p className="count-end">Đang hiện {list.length} / {counts.total} thẻ{selBatch === 'all' ? ` · ${activeBatches.length} đợt đang làm` : ''}. Dữ liệu lưu trên máy này.</p>
        </>
      )}
    </div>
  )
}

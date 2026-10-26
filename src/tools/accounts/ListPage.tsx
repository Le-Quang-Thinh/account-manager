import { useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, ReactElement } from 'react'
import {
  S, STL, fmtDate, noteGroups, noteOrder, inListAccounts, inListFarm,
  chunkByBatch, chunkByNote, rawText, toCSV, setSpecial, setFarm, setNote, sell, unsell,
  editRaw, moveBatch, batchIds, farmCount,
  confirmList, applyTag, addTags,
  PAGE,
} from './store'
import { stamp, fmtShort, download, copyText } from '../../shared/lib/browser'
import { makeZip } from '../../shared/lib/zip'
import { Icon } from '../../shared/components/Icon'
import FloatTags from './FloatTags'
import AddPanel from './AddPanel'
import type { Account, Ctx, Status, StatusFilter } from './types'

const TITLES: Record<string, string> = { list: 'Danh sách', farm: 'Farm', special: 'Special', sold: 'Đã bán' }
const HINTS: Record<string, string> = {
  list: 'Danh sách giữ lại account khi bạn đánh dấu Special hoặc bán. Bấm Xác nhận để lọc còn Farm và tải .zip.',
  farm: 'Chọn ghi chú ở ô bên phải để chuyển account sang Special.',
  special: 'Account có ghi chú giống hệt nhau được gom thành một nhóm. Chọn ghi chú ở ô bên phải để gộp nhóm.',
  sold: 'Gom nhóm theo ghi chú giống tab Special. Bấm Hoàn tác bán để đưa account về Special.',
}
const uiBatch = (b: number) => {
  const m = S.batchMeta[b] || {}
  return `Batch ${b}` + (m.name ? ` ${m.name}` : '')
}

function RawCell({ raw }: { raw: string }) {
  const m = raw.match(/^([^|:;,\t ]+)([|:;,\t ].*)$/)
  return (
    <span className="raw" title={raw}>
      {m ? <><b>{m[1]}</b><span className="pw">{m[2]}</span></> : <b>{raw}</b>}
    </span>
  )
}

function NoteSelect({ a, onPick }: { a: Account; onPick: (a: Account, value: string) => void }) {
  const opts = S.tags.slice()
  if (a.note && !opts.includes(a.note)) opts.push(a.note)
  return (
    <select className="tag-sel" value={a.note || ''} onChange={e => onPick(a, e.target.value)} aria-label={`Ghi chú cho ${a.user}`}>
      <option value="">{a.status === 'farm' ? 'Chọn ghi chú để Special…' : '(không ghi chú)'}</option>
      {opts.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  )
}

interface CheckProps {
  checked: boolean
  indeterminate?: boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  label: string
  disabled?: boolean
  id?: string
  onClick?: MouseEventHandler<HTMLInputElement>
}

function Check({ checked, indeterminate, onChange, label, disabled, id, onClick }: CheckProps) {
  return (
    <input type="checkbox" id={id} checked={checked} disabled={disabled} aria-label={label} onChange={onChange} onClick={onClick}
      ref={el => { if (el) el.indeterminate = !!indeterminate }} />
  )
}

interface NoteBlock { t: 'n'; key: string; note: string; total: number; items: { a: Account; pos: number }[] }
interface GroupBlock { t: 'g'; key: string; b: number; g: number; from: number; to: number; items: { a: Account; pos: number }[] }
interface HeadBlock { t: 'bh'; key: string; b: number }
type TrayBlock = NoteBlock | GroupBlock
type Block = TrayBlock | HeadBlock

export default function ListPage({ ctx }: { ctx: Ctx }) {
  const { tab, goTab, sel, setSel, limit, setLimit, q, setQ, fb, setFb, fs, setFs, fn, setFn, visible, ordered, isNoteTab, farmLock, setFarmLock, commit, toast } = ctx
  const isList = tab === 'list', isSold = tab === 'sold'
  const locked = tab === 'farm' && !!farmLock
  const showSt = isList || locked
  const view = S.settings.view === 'text' ? 'text' : 'table'
  const [menu, setMenu] = useState(false)
  const [adding, setAdding] = useState(false)
  const canAdd = tab === 'farm' || isList
  const lastSel = useRef<number | null>(null)
  const shift = useRef(false)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest('.menu-wrap')) setMenu(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('click', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc) }
  }, [menu])

  const C = () => S.settings.chunk
  const G = Math.max(1, S.settings.group)

  // ----- khối hiển thị -----
  const totals: Record<number, number> = {}
  visible.forEach(a => { totals[a.batch] = (totals[a.batch] || 0) + 1 })
  let blocks: Block[] = []
  if (isNoteTab) {
    blocks = noteGroups(visible).map((g, gi): NoteBlock => ({
      t: 'n', key: 'n' + gi, note: g.note, total: g.items.length,
      items: g.items.map((a, i) => ({ a, pos: i + 1 })),
    }))
  } else {
    let cb: number | null = null, cur: GroupBlock | null = null, pos = 0
    for (const a of visible) {
      if (a.batch !== cb) { cb = a.batch; pos = 0; cur = null; if (fb === 'all') blocks.push({ t: 'bh', key: 'bh' + cb, b: cb }) }
      if (pos % G === 0) {
        const g = pos / G
        cur = { t: 'g', key: `g${cb}:${g}`, b: cb, g, from: pos + 1, to: Math.min(pos + G, totals[cb]), items: [] }
        blocks.push(cur)
      }
      cur!.items.push({ a, pos: pos + 1 })
      pos++
    }
  }
  const trayItems = (key: string) => {
    const bl = blocks.find(b => b.key === key)
    return bl && bl.t !== 'bh' ? bl.items.map(x => x.a) : []
  }

  // ----- chọn -----
  const toggle = (ids: number[], on: boolean) => {
    const n = new Set(sel)
    ids.forEach(id => on ? n.add(id) : n.delete(id))
    setSel(n)
  }
  const onRowCheck = (id: number, checked: boolean) => {
    if (shift.current && lastSel.current != null) {
      const order = ordered.map(a => a.id), i = order.indexOf(lastSel.current), j = order.indexOf(id)
      if (i >= 0 && j >= 0) {
        toggle(order.slice(Math.min(i, j), Math.max(i, j) + 1), checked)
      } else toggle([id], checked)
    } else toggle([id], checked)
    lastSel.current = id
    shift.current = false
  }
  const selN = ordered.reduce((t, a) => t + (sel.has(a.id) ? 1 : 0), 0)
  const allSel = ordered.length > 0 && selN === ordered.length

  // ----- hành động -----
  const doCopy = (list: Account[], label: string) => {
    if (!list.length) { toast('Không có dòng nào để copy.'); return }
    copyText(rawText(list)).then(() => toast(`Đã copy ${list.length} dòng (${label}).`))
      .catch(() => toast('Không copy tự động được. Hãy chọn chế độ Văn bản rồi bôi đen và Ctrl+C.'))
  }
  const doSell = (ids: number[]) => {
    ids = ids.filter(id => { const a = S.accounts.find(x => x.id === id); return a && a.status === 'special' })
    if (!ids.length) { toast('Chưa chọn account Special nào để bán.'); return }
    const v = prompt(`Bán ${ids.length} account. Ghi thông tin bán (người mua, giá…), có thể để trống:`, '')
    if (v === null) return
    const n = sell(ids, v.trim())
    toggle(ids, false)
    commit()
    toast(`Đã chuyển ${n} account sang Đã bán.`)
  }
  const pendingSp = locked ? S.accounts.filter(a => farmLock?.has(a.id) && a.status === 'special').length : 0
  const confirmLock = () => {
    const n = pendingSp
    setFarmLock(new Set(S.accounts.filter(a => a.status === 'farm').map(a => a.id)))
    clear()
    toast(`Đã xác nhận: tách ${n} account Special ra khỏi Farm.`)
  }
  const pickNote = (a: Account, value: string) => {
    if (value) applyTag([a.id], value)
    else if (a.status !== 'farm') setNote([a.id], '')
    else return
    if (!locked) toggle([a.id], false)
    commit()
  }
  const doConfirm = () => {
    const sp = inListAccounts().filter(a => a.status === 'special').length
    const so = inListAccounts().filter(a => a.status === 'sold').length
    const files = chunkByBatch(inListFarm(), C(), 'farm')
    const farmN = inListFarm().length
    if (!sp && !so && !farmN) { toast('Danh sách đang trống.'); return }
    if (!confirm(`Xác nhận cập nhật Danh sách (áp dụng cho tất cả batch)?\n\n- Loại ${sp} Special và ${so} Đã bán khỏi Danh sách (vẫn còn nguyên ở tab Special và Đã bán)\n- Giữ lại ${farmN} account Farm\n- Tải file .zip Farm (${C()} dòng mỗi file, ${files.length} file)`)) return
    const r = confirmList()
    commit()
    if (files.length) download(`farm-xacnhan-${stamp()}.zip`, makeZip(files))
    toast(`Đã xác nhận: loại ${r.special} Special và ${r.sold} Đã bán, còn ${r.kept} Farm.` + (files.length ? ` Đã tải .zip (${files.length} file).` : ''))
  }
  const scope = (kind: string) => S.accounts.filter(a => {
    if (kind === 'list') { if (a.inList === false) return false; if (fs !== 'all' && a.status !== fs) return false }
    else if (a.status !== kind) return false
    if (fn.size && (kind === 'special' || kind === 'sold') && !fn.has((a.note || '').trim())) return false
    return fb === 'all' || a.batch === fb
  })
  const exportAct = (act: string) => {
    setMenu(false)
    const empty = () => toast('Không có account nào để xuất.')
    const map: Record<string, () => void> = {
      zipFarm: () => { const f = chunkByBatch(scope('farm'), C(), 'farm'); if (!f.length) return empty(); download(`farm-${stamp()}.zip`, makeZip(f)) },
      zipList: () => { const f = chunkByBatch(scope('list'), C(), 'all'); if (!f.length) return empty(); download(`danh-sach-${stamp()}.zip`, makeZip(f)) },
      zipSpecial: () => { const f = chunkByNote(scope('special'), C(), 'special'); if (!f.length) return empty(); download(`special-${stamp()}.zip`, makeZip(f)) },
      zipSold: () => { const f = chunkByNote(scope('sold'), C(), 'da-ban'); if (!f.length) return empty(); download(`da-ban-${stamp()}.zip`, makeZip(f)) },
      txtFarm: () => { const l = scope('farm'); if (!l.length) return empty(); download(`farm-${stamp()}.txt`, rawText(l)) },
      txtList: () => { const l = scope('list'); if (!l.length) return empty(); download(`danh-sach-${stamp()}.txt`, rawText(l)) },
      txtSpecial: () => { const l = scope('special'); if (!l.length) return empty(); download(`special-${stamp()}.txt`, rawText(noteOrder(l))) },
      txtSold: () => { const l = scope('sold'); if (!l.length) return empty(); download(`da-ban-${stamp()}.txt`, rawText(noteOrder(l))) },
      csvSpecial: () => { const l = scope('special'); if (!l.length) return empty(); download(`special-${stamp()}.csv`, toCSV(noteOrder(l)), 'text/csv;charset=utf-8') },
      csvSold: () => { const l = scope('sold'); if (!l.length) return empty(); download(`da-ban-${stamp()}.csv`, toCSV(noteOrder(l)), 'text/csv;charset=utf-8') },
      csvList: () => { const l = scope('list'); if (!l.length) return empty(); download(`danh-sach-${stamp()}.csv`, toCSV(l), 'text/csv;charset=utf-8') },
    }
    map[act]()
  }
  // các ghi chú đang có trong tab (theo batch đang lọc), kèm số account
  const noteChips = isNoteTab
    ? noteGroups(S.accounts.filter(a => a.status === tab && (fb === 'all' || a.batch === fb))).map(g => ({ note: g.note, n: g.items.length }))
    : []
  const toggleNote = (note: string) => {
    const n = new Set(fn)
    if (n.has(note)) n.delete(note); else n.add(note)
    setFn(n); setLimit(PAGE)
  }
  const exportItems = (): [string, string][] => {
    const z = `${S.settings.chunk} dòng mỗi file`
    if (tab === 'farm') return [['zipFarm', `Tải .zip, ${z}`], ['txtFarm', 'Tải .txt']]
    if (tab === 'special') return [['zipSpecial', 'Tải .zip, mỗi ghi chú một file'], ['txtSpecial', 'Tải .txt'], ['csvSpecial', 'Tải .csv']]
    if (tab === 'sold') return [['zipSold', 'Tải .zip, mỗi ghi chú một file'], ['txtSold', 'Tải .txt'], ['csvSold', 'Tải .csv']]
    return [['zipList', `Tải .zip, ${z}`], ['txtList', 'Tải .txt'], ['csvList', 'Tải .csv']]
  }

  const selIds = () => [...sel]
  const clear = () => setSel(new Set())
  const bulk = {
    star: () => { const n = setSpecial(selIds(), ''); clear(); commit(); toast(`Đã chuyển ${n} account sang Special (chưa có ghi chú).`) },
    farm: () => { const n = setFarm(selIds()); clear(); commit(); toast(`Đã đưa ${n} account về Farm.`) },
    sell: () => doSell(selIds()),
    unsell: () => { let n = 0; selIds().forEach(i => { if (unsell(i)) n++ }); clear(); commit(); toast(`Đã hoàn tác ${n} account về Special.`) },
    del: () => {
      if (sel.size && confirm(`Xoá hẳn ${sel.size} account đã chọn? Account sẽ mất hoàn toàn khỏi mọi tab.`)) {
        const ids = new Set(sel)
        S.accounts = S.accounts.filter(a => !ids.has(a.id))
        clear(); commit()
      }
    },
    tag: (t: string) => { const n = applyTag(selIds(), t); clear(); commit(); toast(`Đã gắn tag "${t}" cho ${n} account.`) },
  }

  // Tạo ghi chú mới (nếu chưa có, không phân biệt hoa thường) rồi gắn luôn cho các account đã chọn
  const createTag = (text: string) => {
    const name = text.replace(/[\n,;]+/g, ' ').trim()
    if (!name) return
    addTags(name)
    bulk.tag(S.tags.find(x => x.toLowerCase() === name.toLowerCase()) ?? name)
  }

  // ----- vẽ -----
  const trayHead = (bl: TrayBlock) => {
    const items = bl.items.map(x => x.a)
    const n = items.reduce((t, a) => t + (sel.has(a.id) ? 1 : 0), 0)
    let ticks = null
    if (isList) {
      const c: Record<Status, number> = { farm: 0, special: 0, sold: 0 }
      items.forEach(a => c[a.status]++)
      const lab = `${c.farm} Farm, ${c.special} Special, ${c.sold} Đã bán`
      ticks = <span className="ticks" title={lab} aria-label={lab}>{items.map(a => <i key={a.id} className={'t-' + a.status} />)}</span>
    }
    return (
      <div className="tray-h">
        <label className="cb">
          <Check checked={items.length > 0 && n === items.length} indeterminate={n > 0 && n < items.length}
            onChange={e => toggle(items.map(a => a.id), e.target.checked)} label="Chọn cả nhóm" />
        </label>
        {bl.t === 'n'
          ? <>{bl.note ? <span className="tray-t">{bl.note}</span> : <span className="tray-t none">Không có ghi chú</span>}<span className="tray-r">{bl.total} account</span></>
          : <><span className="tray-t">Nhóm {bl.g + 1}</span><span className="tray-r">dòng {bl.from}–{bl.to}</span></>}
        {ticks}
        <span className="sp" />
        <button className="btn sm ghost" onClick={() => doCopy(trayItems(bl.key), bl.t === 'n' ? 'nhóm ghi chú' : 'nhóm')}>Copy nhóm</button>
      </div>
    )
  }

  const doEdit = (a: Account) => {
    const v = prompt('Sửa nội dung account (cả dòng, gồm mật khẩu):', a.raw)
    if (v === null || v.trim() === a.raw) return
    const err = editRaw(a.id, v)
    if (err) { toast(err); return }
    commit()
    toast('Đã sửa account.')
  }
  const doMove = (v: string) => {
    if (v === '') return
    const r = moveBatch(selIds(), +v)
    clear(); commit()
    toast(r.n ? `Đã chuyển ${r.n} account sang Batch ${r.batch}.` : 'Các account đã nằm sẵn trong batch này.')
  }
  const rowActs = (a: Account) => <>
    <button className="btn sm ghost" title="Sửa nội dung account" onClick={() => doEdit(a)}>Sửa</button>
    {rowStatusActs(a)}
  </>
  const rowStatusActs = (a: Account) => {
    if (a.status === 'farm') return <button className="btn sm star" title="Chuyển sang Special" onClick={() => { setSpecial([a.id], ''); toggle([a.id], false); commit() }}><Icon name="star" size={13} />Special</button>
    if (a.status === 'special' && locked) return <button className="btn sm ghost" onClick={() => { setFarm([a.id]); toggle([a.id], false); commit() }}>Về Farm</button>
    if (a.status === 'special') return <>
      <button className="btn sm ghost" onClick={() => { setFarm([a.id]); toggle([a.id], false); commit() }}>Về Farm</button>
      <button className="btn sm sell" onClick={() => doSell([a.id])}>Bán</button>
    </>
    return <button className="btn sm ghost" onClick={() => { if (unsell(a.id)) { toggle([a.id], false); commit(); toast('Đã hoàn tác, account về lại Special.') } }}>Hoàn tác bán</button>
  }

  const cols = 5 + (isNoteTab ? 1 : 0) + (showSt ? 1 : 0) + (isSold ? 2 : 0)
  let shown = 0
  const bodyEls: ReactElement[] = []
  for (const bl of blocks) {
    if (shown >= limit) break
    if (bl.t === 'bh') {
      const m = S.batchMeta[bl.b] || {}
      if (view === 'text') {
        bodyEls.push(<h2 key={bl.key} className="bh-n" style={{ margin: '18px 0 8px' }}>{uiBatch(bl.b)} <span className="bh-m">{totals[bl.b]} account</span></h2>)
      } else {
        bodyEls.push(
          <tr key={bl.key} className="bh"><td colSpan={cols}>
            <span className="bh-n">{uiBatch(bl.b)}</span>
            <span className="bh-m">{m.at ? 'nhập ' + fmtShort(m.at) : ''}</span>
            <span className="bh-m">{totals[bl.b]} account</span>
          </td></tr>)
      }
      continue
    }
    const take = bl.items.slice(0, limit - shown)
    shown += take.length
    if (view === 'text') {
      bodyEls.push(
        <div key={bl.key} className="trayx">
          {trayHead(bl)}
          <textarea readOnly wrap="off" spellCheck="false" rows={take.length} aria-label="Danh sách để copy"
            value={take.map(x => x.a.raw).join('\n')} />
        </div>)
    } else {
      bodyEls.push(<tr key={bl.key} className="tray"><td colSpan={cols}>{trayHead(bl)}</td></tr>)
      for (const { a, pos } of take) {
        bodyEls.push(
          <tr key={a.id} className={'r s-' + a.status}>
            <td className="c-cb"><label className="cb">
              <input type="checkbox" checked={sel.has(a.id)} aria-label={`Chọn ${a.user}`}
                onClick={e => { shift.current = e.shiftKey }}
                onChange={e => onRowCheck(a.id, e.target.checked)} />
            </label></td>
            <td className="c-n">{pos}</td>
            {isNoteTab && <td className="c-batch">Batch {a.batch}</td>}
            <td><RawCell raw={a.raw} /></td>
            {showSt && <td className="c-st"><span className="st"><span className={'dot ' + a.status} />{STL[a.status]}</span></td>}
            <td className="c-note"><NoteSelect a={a} onPick={pickNote} /></td>
            {isSold && <><td>{a.sale}</td><td className="c-date">{fmtDate(a.soldAt)}</td></>}
            <td className="c-act">{rowActs(a)}</td>
          </tr>)
      }
    }
  }

  const emptyView = () => {
    if (q.trim()) return <div className="empty"><h2>Không có account nào khớp</h2><p>Không thấy kết quả cho “{q.trim()}”. Xoá từ khoá để xem lại toàn bộ danh sách.</p><button className="btn solid" onClick={() => setQ('')}>Xoá tìm kiếm</button></div>
    if (tab === 'special') return <div className="empty"><h2>Chưa có account Special</h2><p>Vào tab Farm, chọn ghi chú để chuyển account sang đây.</p><button className="btn solid" onClick={() => goTab('farm')}>Mở Farm</button></div>
    if (tab === 'sold') return <div className="empty"><h2>Chưa bán account nào</h2><p>Khi bán xong, bấm Bán ở account trong tab Special để ghi nhận.</p><button className="btn solid" onClick={() => goTab('special')}>Mở Special</button></div>
    if (fb !== 'all' || fs !== 'all') return <div className="empty"><h2>Không có account trong bộ lọc này</h2><p>Chọn batch hoặc trạng thái khác ở thanh bên.</p><button className="btn solid" onClick={() => { setFb('all') }}>Xem tất cả batch</button></div>
    return <div className="empty"><h2>Chưa có account nào</h2><p>Dán danh sách account ở tab Nhập / Xuất. Mỗi lần nhập tạo một batch mới.</p><button className="btn solid" onClick={() => goTab('tools')}>Nhập account</button></div>
  }

  const acts = () => {
    const star = <button className="btn star" onClick={bulk.star}><Icon name="star" size={13} />Đánh dấu Special</button>
    const farm = <button className="btn" onClick={bulk.farm}>Về Farm</button>
    const sellB = <button className="btn" onClick={bulk.sell}>Bán</button>
    const un = <button className="btn" onClick={bulk.unsell}>Hoàn tác bán</button>
    const del = <button className="btn" onClick={bulk.del}>Xoá</button>
    if (tab === 'farm') return <>{star}{locked && farm}{del}</>
    if (tab === 'special') return <>{farm}{sellB}{del}</>
    if (tab === 'sold') return <>{un}{del}</>
    return <>{star}{farm}{sellB}{del}</>
  }

  return (
    <>
      <header className="head">
        <div>
          <h1>{TITLES[tab]}</h1>
          <p className="sub"><b>{ordered.length}</b> account{fb === 'all' ? '' : ` trong ${uiBatch(fb)}`}</p>
        </div>
        <div className="head-c">
          <input className="search" type="search" placeholder="Tìm tài khoản hoặc ghi chú" aria-label="Tìm tài khoản hoặc ghi chú"
            value={q} onChange={e => { setQ(e.target.value); setLimit(PAGE) }} />
          {isList && (
            <div className="seg" role="group" aria-label="Lọc theo trạng thái">
              {([['all', 'Tất cả', ''], ['farm', 'Farm', 'farm'], ['special', 'Special', 'special'], ['sold', 'Đã bán', 'sold']] as [StatusFilter, string, string][]).map(([v, l, d]) => (
                <button key={v} className={fs === v ? 'on' : ''} aria-pressed={fs === v} onClick={() => { setFs(v); setLimit(PAGE) }}>
                  {d ? <span className={'dot ' + d} /> : null}{l}
                </button>
              ))}
            </div>
          )}
          <div className="seg" role="group" aria-label="Kiểu hiển thị">
            <button className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => { S.settings.view = 'table'; commit() }}>Bảng</button>
            <button className={view === 'text' ? 'on' : ''} aria-pressed={view === 'text'} title="Hiện từng nhóm trong ô văn bản để bôi đen và Ctrl+C" onClick={() => { S.settings.view = 'text'; commit() }}>Văn bản</button>
          </div>
          <button className="btn solid" onClick={() => doCopy(ordered, 'tất cả đang hiện')}>Copy tất cả ({ordered.length})</button>
          <div className="menu-wrap">
            <button className="btn" aria-haspopup="menu" onClick={() => setMenu(m => !m)}>Xuất file</button>
            <div className="menu" role="menu" hidden={!menu}>
              {exportItems().map(([a, l]) => <button key={a} className="menu-i" role="menuitem" onClick={() => exportAct(a)}>{l}</button>)}
            </div>
          </div>
          {canAdd && <button className="btn" aria-expanded={adding} title="Thêm account vào batch (bù batch bị lẻ)" onClick={() => setAdding(v => !v)}>Thêm account</button>}
          {isList && <button className="btn teal" title="Loại Special và Đã bán khỏi Danh sách, chỉ giữ Farm, rồi tải .zip Farm" onClick={doConfirm}>Xác nhận và xuất Farm</button>}
        </div>
      </header>
      {canAdd && adding && (
        <AddPanel fb={fb} onClose={() => setAdding(false)}
          onDone={(b, msg) => { toast(msg); if (b) { commit(); setAdding(false) } }} />
      )}
      <FloatTags tags={S.tags} count={sel.size} onTag={bulk.tag} onCreate={createTag} onClear={clear} />
      {isNoteTab && noteChips.length > 0 && (
        <div className="notefilter" role="group" aria-label="Lọc theo ghi chú">
          <span className="hint-inline">Lọc ghi chú (cũng áp dụng khi xuất file):</span>
          <button className={'chip' + (fn.size === 0 ? ' on' : '')} aria-pressed={fn.size === 0} onClick={() => setFn(new Set())}>Tất cả</button>
          {noteChips.map(c => (
            <button key={c.note} className={'chip' + (fn.has(c.note) ? ' on' : '')} aria-pressed={fn.has(c.note)} onClick={() => toggleNote(c.note)}>
              {c.note || 'Không ghi chú'} ({c.n})
            </button>
          ))}
        </div>
      )}
      <p className="hint">{locked ? 'Đang khóa trạng thái: account đánh dấu Special vẫn ở lại Farm. Bấm “Xác nhận đã đánh dấu xong” để tách Special ra.' : HINTS[tab]}</p>
      <div className={'selbar' + (sel.size ? ' on' : '')}>
        <label className="cb">
          <Check id="selAll" checked={allSel} indeterminate={selN > 0 && !allSel} disabled={!ordered.length} label="Chọn tất cả"
            onChange={e => toggle(ordered.map(a => a.id), e.target.checked)} />
          <span>{sel.size ? <><b>{sel.size}</b> đã chọn</> : `Chọn tất cả ${ordered.length}`}</span>
        </label>
        {sel.size > 0 && (
          <div className="selacts">
            {S.tags.map(t => <button key={t} className="chip" title="Gắn tag cho các account đã chọn" onClick={() => bulk.tag(t)}>{t}</button>)}
            {acts()}
            <select className="mv-sel" value="" aria-label="Chuyển sang batch khác" onChange={e => doMove(e.target.value)}>
              <option value="">Chuyển batch…</option>
              {batchIds().map(b => <option key={b} value={b}>{uiBatch(b)} ({farmCount(b)} Farm)</option>)}
              <option value={0}>Batch mới</option>
            </select>
            <button className="btn" onClick={clear}>Bỏ chọn</button>
          </div>
        )}
      </div>
      <div id="rows">
        {!visible.length ? emptyView() : (
          <>
            {view === 'text' ? bodyEls : (
              <div className="tbl-wrap">
                <table className={'tbl ' + (showSt ? 'showst' : '')}>
                  <thead><tr>
                    <th></th><th className="c-n">#</th>{isNoteTab && <th>Batch</th>}<th>Account và mật khẩu</th>
                    {showSt && <th>Trạng thái</th>}<th>Ghi chú</th>{isSold && <><th>Thông tin bán</th><th>Ngày bán</th></>}<th></th>
                  </tr></thead>
                  <tbody>{bodyEls}</tbody>
                </table>
              </div>
            )}
            {visible.length > shown
              ? <div className="more"><span className="count-end">Đang hiện {shown} trên {visible.length} account</span><button className="btn" onClick={() => setLimit(limit + PAGE)}>Hiện thêm {PAGE}</button></div>
              : <p className="count-end">{visible.length} account</p>}
          </>
        )}
      </div>
      {locked && (
        <div className="lockbar">
          <span>{pendingSp ? <><b>{pendingSp}</b> account đã đánh dấu Special đang được giữ lại trong Farm</> : 'Khóa trạng thái đang bật: account đánh dấu Special sẽ ở lại Farm'}</span>
          <button className="btn teal" title="Tách các account đã đánh dấu Special ra khỏi Farm" onClick={confirmLock}>Xác nhận đã đánh dấu xong</button>
        </div>
      )}
    </>
  )
}

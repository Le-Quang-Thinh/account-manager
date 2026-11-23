import { useState } from 'react'
import type { ChangeEvent, ClipboardEvent, ReactNode } from 'react'
import {
  S, save, fresh, normalize, replaceS, isFileStorage, importLines, bulkSpecial, bulkSell, logToSpecial, addTags, removeTag,
  chunkByBatch, chunkByNote, rawText, toCSV, noteOrder, batchIds, batchLabel, deleteBatches, mergeBatches, toggleHiddenTag,
  batchFiles, noteFiles, addEvent, removeEvent,
} from './store'
import { stamp, download } from '../../shared/lib/browser'
import { makeZip } from '../../shared/lib/zip'
import { fsSupported, pickDir, writeFiles } from '../../shared/lib/fs'
import type { Account, Ctx } from './types'

export default function ImportExport({ ctx, onRestored }: { ctx: Ctx; onRestored: () => void }) {
  const { goTab, commit, toast, setFb, setFs, setSel } = ctx
  const s = S.settings
  const [imp, setImp] = useState('')
  const [impName, setImpName] = useState('')
  const [sp, setSp] = useState('')
  const [spPass, setSpPass] = useState('Gamepika238@') // mật khẩu gắn vào khi dán log từ Google Sheet
  const [spEvent, setSpEvent] = useState('') // event gắn cho cả đợt nhập special (rỗng = special thường)
  const [sell, setSell] = useState('') // danh sách account cần chuyển Special -> Đã bán
  const [sellInfo, setSellInfo] = useState('') // thông tin bán gắn cho cả đợt
  const [sellNote, setSellNote] = useState('') // ghi chú gắn cho cả đợt (để trống = giữ ghi chú cũ)
  const [tagIn, setTagIn] = useState('')
  const [chunk, setChunk] = useState(String(s.chunk))
  const [group, setGroup] = useState(String(s.group))
  const [delSel, setDelSel] = useState<Set<number>>(() => new Set()) // batch đã chọn để xoá
  const [mrgSel, setMrgSel] = useState<Set<number>>(() => new Set()) // batch đã chọn để gộp
  const [mrgTarget, setMrgTarget] = useState(0) // batch đích khi gộp (0 = tạo batch mới)
  const [mrgDedupe, setMrgDedupe] = useState(true) // lọc trùng tài khoản khi gộp
  const [mrgName, setMrgName] = useState('') // tên batch mới khi gộp vào batch mới

  const doImport = () => {
    const r = importLines(imp, impName)
    save()
    if (r.add) {
      goTab('farm')
      setFb(r.batch ?? 'all')
      setFs('all')
      setSel(new Set())
      commit()
      toast(`Đã tạo Batch ${r.batch}: ${r.add} account vào Farm, bỏ qua ${r.dup} dòng trùng.`)
    } else toast(r.dup ? `Không có account mới (${r.dup} dòng trùng).` : 'Chưa dán danh sách nào.')
  }
  const doBulk = () => {
    if (!sp.trim()) { toast('Chưa dán danh sách.'); return }
    const r = bulkSpecial(sp, spEvent)
    commit()
    let msg = `Đã chuyển ${r.n} account sang Special` + (spEvent.trim() ? ` (event ${spEvent.trim()})` : '') + '.'
    if (r.created) msg += ` Tạo mới ${r.created} account không có trong danh sách vào ${batchLabel(r.batch!)}.`
    if (r.miss.length) msg += ` Bỏ qua ${r.miss.length} dòng trùng account đã bán (để lại trong ô).`
    setSp(r.miss.join('\n'))
    if (r.created) { goTab('special'); setFb(r.batch!) } // mở luôn batch unknown để thấy account vừa tạo
    toast(msg)
  }
  const doSell = () => {
    if (!sell.trim()) { toast('Chưa dán danh sách.'); return }
    const r = bulkSell(sell, sellInfo, sellNote)
    commit()
    let msg = `Đã chuyển ${r.n} account sang Đã bán`
      + (sellInfo.trim() ? ` (thông tin bán: ${sellInfo.trim()})` : '')
      + (sellNote.trim() ? ` · ghi chú: ${sellNote.trim()}` : '') + '.'
    if (r.miss.length) msg += ` Bỏ qua ${r.miss.length} dòng không bán được (không phải Special / không tìm thấy, để lại trong ô).`
    setSell(r.miss.join('\n'))
    if (r.n) goTab('sold')
    toast(msg)
  }
  // Dán log Google Sheet: tự chuẩn hoá thành "username:pass # pokemon_name[_size]" rồi nối vào ô
  const pasteLog = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const r = logToSpecial(e.clipboardData.getData('text'), spPass.trim())
    if (!r) return // không phải log, dán bình thường
    e.preventDefault()
    if (r.lines.length) setSp(v => (v.trim() ? v.replace(/\s*$/, '') + '\n' : '') + r.lines.join('\n'))
    toast(`Đã chuẩn hoá ${r.lines.length} dòng từ log`
      + (r.dyn ? `, ${r.dyn} dòng gắn event dynamax (hậu tố @dynamax)` : '')
      + (r.skipped ? `, bỏ ${r.skipped} dòng không có username.` : '.'))
  }
  const readFiles = (e: ChangeEvent<HTMLInputElement>) => {
    ;[...(e.target.files || [])].forEach(f => {
      const r = new FileReader()
      r.onload = () => {
        setImp(v => (v ? v.replace(/\s*$/, '') + '\n' : '') + String(r.result))
        toast('Đã đọc ' + f.name + '. Bấm Nhập thành batch mới.')
      }
      r.readAsText(f)
    })
    e.target.value = ''
  }
  const addTag = () => {
    if (!tagIn.trim()) { toast('Chưa nhập tag.'); return }
    const n = addTags(tagIn)
    commit(); setTagIn('')
    toast(n ? `Đã thêm ${n} tag.` : 'Tag đã có sẵn.')
  }
  // Lưu event đang gõ vào danh sách gợi ý để dùng lại lần sau
  const saveEvent = () => {
    const t = spEvent.trim()
    if (!t) { toast('Chưa nhập tên event.'); return }
    const added = addEvent(t)
    commit()
    toast(added ? `Đã lưu event "${t}".` : `Event "${t}" đã có sẵn.`)
  }
  const delEvent = (ev: string) => {
    if (!confirm(`Xoá event "${ev}" khỏi danh sách gợi ý? Account đã gắn event này vẫn giữ nguyên.`)) return
    removeEvent(ev); commit()
  }
  const restore = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const j = normalize(JSON.parse(String(r.result)))
        if (!j) throw new Error('invalid')
        if (!confirm(`Khôi phục ${j.accounts.length} account? Dữ liệu hiện tại sẽ bị thay thế.`)) return
        replaceS(j)
        onRestored()
        commit()
        toast('Đã khôi phục.')
      } catch (err) { alert('File sao lưu không hợp lệ. Hãy chọn đúng file sao lưu của tool này.') }
    }
    r.readAsText(f)
    e.target.value = ''
  }
  const bids = batchIds()
  const perBatch = new Map<number, number>()
  for (const a of S.accounts) perBatch.set(a.batch, (perBatch.get(a.batch) || 0) + 1)
  const delIds = bids.filter(b => delSel.has(b)) // bỏ batch đã biến mất (vd. sau khi khôi phục)
  const delN = delIds.reduce((n, b) => n + (perBatch.get(b) || 0), 0)
  const toggleDel = (b: number) => setDelSel(o => { const n = new Set(o); if (n.has(b)) n.delete(b); else n.add(b); return n })
  const doDelBatches = () => {
    if (!delIds.length) { toast('Chưa chọn batch nào.'); return }
    const names = delIds.map(b => 'Batch ' + b).join(', ')
    if (!confirm(`Xoá hẳn ${delIds.length} batch (${names}) gồm ${delN} account? Account sẽ mất hoàn toàn khỏi mọi tab, kể cả Special và Đã bán.`)) return
    const n = deleteBatches(delIds)
    setDelSel(new Set()); setFb('all'); setSel(new Set()); commit()
    toast(`Đã xoá ${delIds.length} batch, ${n} account.`)
  }
  const mrgIds = bids.filter(b => mrgSel.has(b)) // bỏ batch đã biến mất
  const mrgN = mrgIds.reduce((n, b) => n + (perBatch.get(b) || 0), 0)
  // batch đích hợp lệ = batch đang được chọn; nếu không, coi như tạo batch mới
  const effTarget = mrgTarget && mrgIds.includes(mrgTarget) ? mrgTarget : 0
  const toggleMrg = (b: number) => setMrgSel(o => { const n = new Set(o); if (n.has(b)) n.delete(b); else n.add(b); return n })
  const doMerge = () => {
    if (mrgIds.length < 2) { toast('Hãy chọn ít nhất 2 batch để gộp.'); return }
    const into = effTarget ? batchLabel(effTarget) : 'một batch mới' + (mrgName.trim() ? ` (${mrgName.trim()})` : '')
    if (!confirm(`Gộp ${mrgIds.length} batch (${mrgN} account) vào ${into}?` + (mrgDedupe ? '\nAccount trùng tên tài khoản sẽ bị bỏ bớt, giữ bản nhiều thông tin nhất (Đã bán > Special > Farm).' : ''))) return
    const r = mergeBatches(mrgIds, effTarget, mrgDedupe, mrgName)
    setMrgSel(new Set()); setMrgTarget(0); setMrgName('')
    setFb(r.target ?? 'all'); setSel(new Set()); commit()
    let msg = `Đã gộp ${r.sources} batch vào ${batchLabel(r.target!)}: dồn ${r.moved} account.`
    if (mrgDedupe) msg += r.removed ? ` Bỏ ${r.removed} account trùng tên.` : ' Không có account trùng tên.'
    toast(msg)
  }
  const wipe = () => {
    if (confirm('XOÁ TOÀN BỘ dữ liệu? Không thể hoàn tác (hãy sao lưu trước).') && confirm('Chắc chắn xoá hết?')) {
      replaceS(fresh()); onRestored(); commit()
    }
  }

  const all = (kind: string): Account[] => S.accounts.filter(a => kind === 'list' ? a.inList !== false : a.status === kind)
  const C = () => S.settings.chunk
  type Exp = [string, BlobPart, Account[], string?]
  const ex: Record<string, () => Exp> = {
    zipFarm: () => [`farm-${stamp()}.zip`, makeZip(chunkByBatch(all('farm'), C(), 'farm')), all('farm')],
    zipList: () => [`danh-sach-${stamp()}.zip`, makeZip(chunkByBatch(all('list'), C(), 'all')), all('list')],
    zipSpecial: () => [`special-${stamp()}.zip`, makeZip(chunkByNote(all('special'), C(), 'special')), all('special')],
    zipSold: () => [`da-ban-${stamp()}.zip`, makeZip(chunkByNote(all('sold'), C(), 'da-ban')), all('sold')],
    txtFarm: () => [`farm-${stamp()}.txt`, rawText(all('farm')), all('farm')],
    txtList: () => [`danh-sach-${stamp()}.txt`, rawText(all('list')), all('list')],
    txtSpecial: () => [`special-${stamp()}.txt`, rawText(noteOrder(all('special'))), all('special')],
    txtSold: () => [`da-ban-${stamp()}.txt`, rawText(noteOrder(all('sold'))), all('sold')],
    csvList: () => [`danh-sach-${stamp()}.csv`, toCSV(all('list')), all('list'), 'text/csv;charset=utf-8'],
    csvSpecial: () => [`special-${stamp()}.csv`, toCSV(noteOrder(all('special'))), all('special'), 'text/csv;charset=utf-8'],
    csvSold: () => [`da-ban-${stamp()}.csv`, toCSV(noteOrder(all('sold'))), all('sold'), 'text/csv;charset=utf-8'],
  }
  const run = (k: string) => {
    const [name, data, list, mime] = ex[k]()
    if (!list.length) { toast('Không có account nào để xuất.'); return }
    download(name, data, mime)
  }
  const B = ({ k, children }: { k: string; children: ReactNode }) => <button className="btn" onClick={() => run(k)}>{children}</button>

  // Xuất thẳng vào thư mục người dùng chọn, giữ cấu trúc manage-account/{farm,list,special,sell}/
  const exportToFolder = async () => {
    if (!fsSupported()) { toast('Trình duyệt này không hỗ trợ chọn thư mục. Hãy dùng Chrome/Edge, hoặc tải .zip ở trên.'); return }
    const farm = all('farm'), list = all('list'), special = all('special'), sold = all('sold')
    if (!farm.length && !list.length && !special.length && !sold.length) { toast('Không có account nào để xuất.'); return }
    const root = await pickDir()
    if (!root) return // user huỷ chọn
    const files = [
      ...batchFiles(farm, 'farm'),
      ...batchFiles(list, 'list'),
      ...noteFiles(special, 'special'),
      ...noteFiles(sold, 'sell'),
    ]
    try {
      const n = await writeFiles(root, files)
      toast(`Đã ghi ${n} file vào thư mục đã chọn (farm-… · list-… · special-… · sell-…).`)
    } catch (e) {
      toast('Không ghi được vào thư mục (có thể bị từ chối quyền ghi). Thử lại, hoặc tải .zip.')
    }
  }

  return (
    <>
      <header className="head"><div><h1>Nhập / Xuất</h1><p className="sub">Nhập batch mới, đánh dấu Special hàng loạt, xuất file và sao lưu.</p></div></header>
      <div className="doc">
        <section className="sec"><h2>Nhập account</h2>
          <p>Dán danh sách, mỗi dòng một account, ví dụ <code>account:password</code>. Mỗi lần nhập tạo một batch riêng (Batch 1, Batch 2…) và đưa tất cả vào Farm và Danh sách. Tên tài khoản trùng với batch trước sẽ tự bỏ qua. Nếu account nằm trong file Excel, hãy copy cột account rồi dán vào đây.</p>
          <textarea className="ta" value={imp} onChange={e => setImp(e.target.value)} placeholder={'account1:password1\naccount2:password2'} aria-label="Danh sách account cần nhập" />
          <div className="row">
            <input className="file" type="file" accept=".txt,.csv,.tsv" multiple aria-label="Chọn file danh sách" onChange={readFiles} />
            <input className="inp" type="text" value={impName} onChange={e => setImpName(e.target.value)} placeholder="Tên batch (không bắt buộc)" style={{ minWidth: 230 }} />
            <button className="btn solid" onClick={doImport}>Nhập thành batch mới</button>
          </div>
        </section>
        <section className="sec"><h2>Đánh dấu Special hàng loạt</h2>
          <p>Nếu bạn đã có sẵn danh sách special, dán vào đây, mỗi dòng <code>account:password # ghi chú</code> hoặc chỉ tên account. Phần ghi chú sau dấu # có thể bỏ trống. Tool tự tìm account ở mọi batch; account không có ở batch nào sẽ được tạo mới vào batch <code>unknown</code> và đánh dấu Special luôn.</p>
          <p>Điền ô <b>Event</b> bên dưới (vd <code>dynamax</code>) thì <b>cả đợt</b> special nhập vào đều thuộc event đó; để trống = special thường. Muốn gắn event riêng cho vài dòng thì thêm hậu tố <code>@tên-event</code> ở cuối dòng. Ở tab Special sẽ có hàng lọc theo event, mỗi event vẫn gom nhóm theo tên pokemon.</p>
          <p>Có thể copy thẳng các dòng log từ Google Sheet (kèm hoặc không kèm dòng header) và dán vào: tool tự đổi thành <code>username:mật khẩu # pokemon_name</code>, thêm <code>_XXS</code> / <code>_XXL</code> nếu size là XXS hoặc XXL. Riêng costume <code>Specialbackground2025Global</code> tự gắn hậu tố <code>@dynamax</code> (vào event dynamax, giữ nguyên tên pokemon). Dòng không có username sẽ bị bỏ qua.</p>
          <div className="row">
            <input className="inp" type="text" value={spEvent} onChange={e => setSpEvent(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEvent()} placeholder="Event (vd dynamax, để trống = special thường)" aria-label="Event cho đợt special này" list="sp-events" style={{ minWidth: 300 }} />
            <datalist id="sp-events">{S.events.map(ev => <option key={ev} value={ev} />)}</datalist>
            <button className="btn" onClick={saveEvent} disabled={!spEvent.trim()}>+ Lưu event</button>
            <input className="inp" type="text" value={spPass} onChange={e => setSpPass(e.target.value)} placeholder="Mật khẩu khi dán log" aria-label="Mật khẩu gắn vào khi dán log" style={{ minWidth: 230 }} />
          </div>
          {S.events.length > 0 && (
            <div className="chips">
              {S.events.map(ev => (
                <span key={ev} className="chip rm">
                  <button type="button" className="chip-pick" onClick={() => setSpEvent(ev)} title="Dùng event này">{ev}</button>
                  <button aria-label={`Xoá event ${ev}`} onClick={() => delEvent(ev)}>×</button>
                </span>
              ))}
            </div>
          )}
          <textarea className="ta" style={{ minHeight: 110 }} value={sp} onChange={e => setSp(e.target.value)} onPaste={pasteLog} placeholder={'account5:pass5 # skin hiếm\naccount9 # rank cao\n(hoặc dán log từ Google Sheet)'} aria-label="Danh sách special" />
          <div className="row"><button className="btn star" onClick={doBulk}>Chuyển sang Special</button></div>
        </section>
        <section className="sec"><h2>Bán hàng loạt (Special → Đã bán)</h2>
          <p>Dán danh sách account cần bán, mỗi dòng một account (có thể kèm <code>:password</code> hoặc <code># ghi chú riêng</code>). Chỉ account đang ở <b>Special</b> mới được chuyển sang <b>Đã bán</b>. Dòng không tìm thấy, đang Farm, hoặc đã bán rồi sẽ được giữ lại trong ô để bạn kiểm tra.</p>
          <p>Ô <b>Thông tin bán</b> và <b>Ghi chú</b> bên dưới được gắn cho cả đợt. Ghi chú riêng sau dấu <code>#</code> của từng dòng sẽ được ưu tiên. Để trống ô Ghi chú thì giữ nguyên ghi chú cũ của account.</p>
          <div className="row">
            <input className="inp" type="text" value={sellInfo} onChange={e => setSellInfo(e.target.value)} placeholder="Thông tin bán (vd: giá, người mua...)" aria-label="Thông tin bán cho đợt này" style={{ minWidth: 300 }} />
            <input className="inp" type="text" value={sellNote} onChange={e => setSellNote(e.target.value)} placeholder="Ghi chú (để trống = giữ ghi chú cũ)" aria-label="Ghi chú cho đợt bán này" style={{ minWidth: 260 }} />
          </div>
          <textarea className="ta" style={{ minHeight: 110 }} value={sell} onChange={e => setSell(e.target.value)} placeholder={'account5\naccount9 # ghi chú riêng\naccount12:pass12'} aria-label="Danh sách account cần bán" />
          <div className="row"><button className="btn star" onClick={doSell}>Chuyển sang Đã bán</button></div>
        </section>
        <section className="sec"><h2>Xuất file</h2>
          <p>Farm và Danh sách: .zip tách theo batch, mỗi file đúng số dòng đặt bên dưới (tên dạng <code>batch2-farm-01.txt</code>). Special và Đã bán: .zip tách theo ghi chú, mỗi ghi chú một file, nhóm quá dài sẽ chia thêm -p01, -p02.</p>
          <p>Hoặc ghi thẳng vào một thư mục trên máy (Chrome/Edge): mỗi lần sẽ hỏi chọn thư mục. Farm/Danh sách mỗi batch một file <code>farm-tênbatch.txt</code> / <code>list-tênbatch.txt</code>; Special/Đã bán mỗi ghi chú một file <code>special-ghichú.txt</code> / <code>sell-ghichú.txt</code>.</p>
          <div className="row">
            <button className="btn solid" onClick={exportToFolder} disabled={!fsSupported()} title={fsSupported() ? undefined : 'Trình duyệt không hỗ trợ — dùng Chrome/Edge'}>📁 Xuất vào thư mục</button>
            {!fsSupported() && <span className="hint">Trình duyệt này không hỗ trợ chọn thư mục, hãy dùng nút .zip bên dưới.</span>}
          </div>
          <div className="row"><B k="zipFarm">Farm .zip</B><B k="zipList">Danh sách .zip</B><B k="zipSpecial">Special .zip</B><B k="zipSold">Đã bán .zip</B></div>
          <div className="row"><B k="txtFarm">Farm .txt</B><B k="txtList">Danh sách .txt</B><B k="txtSpecial">Special .txt</B><B k="txtSold">Đã bán .txt</B></div>
          <div className="row"><B k="csvList">Danh sách .csv</B><B k="csvSpecial">Special .csv</B><B k="csvSold">Đã bán .csv</B>
            <button className="btn" onClick={() => download(`toan-bo-${stamp()}.csv`, toCSV(S.accounts), 'text/csv;charset=utf-8')}>Toàn bộ dữ liệu .csv (kể cả account đã lọc khỏi Danh sách)</button></div>
        </section>
        <section className="sec"><h2>Xoá batch</h2>
          <p>Bấm chọn một hoặc nhiều batch rồi bấm Xoá. Toàn bộ account của batch đó sẽ bị xoá hẳn ở mọi tab (kể cả Special và Đã bán). Nên tải file sao lưu trước.</p>
          <div className="chips">
            {bids.length ? bids.map(b => (
              <button key={b} type="button" className={'chip' + (delSel.has(b) ? ' on' : '')} aria-pressed={delSel.has(b)} onClick={() => toggleDel(b)}>
                {batchLabel(b)} · {perBatch.get(b) || 0}
              </button>
            )) : <span className="none">Chưa có batch nào.</span>}
          </div>
          {bids.length > 0 && (
            <div className="row">
              <button className="btn" onClick={() => setDelSel(new Set(delIds.length === bids.length ? [] : bids))}>{delIds.length === bids.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
              <span className="sp" />
              <button className="btn danger" disabled={!delIds.length} onClick={doDelBatches}>
                {delIds.length ? `Xoá ${delIds.length} batch (${delN} account)` : 'Xoá batch đã chọn'}
              </button>
            </div>
          )}
        </section>
        <section className="sec"><h2>Gộp batch</h2>
          <p>Chọn từ 2 batch trở lên để gộp chung thành một batch. Chọn batch đích ở ô bên dưới (hoặc tạo batch mới). Account được giữ nguyên, chỉ dồn về batch đích. Bật <b>Lọc trùng tài khoản</b> để bỏ account trùng tên tài khoản khi gộp — nếu trùng, tool giữ bản nhiều thông tin nhất (Đã bán &gt; Special &gt; Farm, ưu tiên bản có ghi chú). Dữ liệu bình thường mỗi tài khoản chỉ ở một batch nên thường không có dòng nào bị bỏ.</p>
          <div className="chips">
            {bids.length ? bids.map(b => (
              <button key={b} type="button" className={'chip' + (mrgSel.has(b) ? ' on' : '')} aria-pressed={mrgSel.has(b)} onClick={() => toggleMrg(b)}>
                {batchLabel(b)} · {perBatch.get(b) || 0}
              </button>
            )) : <span className="none">Chưa có batch nào.</span>}
          </div>
          {bids.length > 0 && (
            <>
              <div className="row">
                <label className="fld">Gộp vào
                  <select className="inp" value={effTarget} onChange={e => setMrgTarget(Number(e.target.value))} style={{ minWidth: 200 }} aria-label="Batch đích khi gộp">
                    <option value={0}>Tạo batch mới</option>
                    {mrgIds.map(b => <option key={b} value={b}>{batchLabel(b)}</option>)}
                  </select>
                </label>
                {effTarget === 0 && (
                  <input className="inp" type="text" value={mrgName} onChange={e => setMrgName(e.target.value)} placeholder="Tên batch mới (không bắt buộc)" style={{ minWidth: 220 }} aria-label="Tên batch mới" />
                )}
                <label className="fld"><input type="checkbox" checked={mrgDedupe} onChange={e => setMrgDedupe(e.target.checked)} /> Lọc trùng tài khoản</label>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setMrgSel(new Set(mrgIds.length === bids.length ? [] : bids))}>{mrgIds.length === bids.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
                <span className="sp" />
                <button className="btn solid" disabled={mrgIds.length < 2} onClick={doMerge}>
                  {mrgIds.length >= 2 ? `Gộp ${mrgIds.length} batch (${mrgN} account)` : 'Gộp batch đã chọn'}
                </button>
              </div>
            </>
          )}
        </section>
        <section className="sec"><h2>Cài đặt ghi chú: danh sách lựa chọn</h2>
          <p>Ghi chú là danh sách lựa chọn. Nhập các lựa chọn ở đây (cách nhau bằng dấu phẩy), ví dụ <code>pikachu</code>. Ở các tab, ô ghi chú của mỗi dòng là ô chọn: chọn <code>pikachu</code> là xong, account ở Farm sẽ tự chuyển sang Special. Tick nhiều account thì bấm nút lựa chọn trên thanh chọn để gắn cho cả loạt. Xoá một lựa chọn không làm mất ghi chú đã gắn.</p>
          <div className="row">
            <input className="inp" type="text" value={tagIn} onChange={e => setTagIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="vd: pikachu, rank cao" style={{ minWidth: 260 }} />
            <button className="btn solid" onClick={addTag}>Thêm lựa chọn</button>
          </div>
          <div className="chips">
            {S.tags.length ? S.tags.map(t => {
              const hidden = S.hiddenTags.includes(t)
              return (
                <span key={t} className={'chip rm' + (hidden ? ' hid' : '')} title={hidden ? 'Đã ẩn khỏi ô chọn, vẫn lọc được' : undefined}>{t}
                  <button className="hide" aria-label={`${hidden ? 'Hiện lại' : 'Ẩn'} tag ${t}`} onClick={() => { toggleHiddenTag(t); commit() }}>{hidden ? 'Hiện' : 'Ẩn'}</button>
                  <button aria-label={`Xoá tag ${t}`} onClick={() => { removeTag(t); commit() }}>×</button>
                </span>
              )
            }) : <span className="none">Chưa có tag nào.</span>}
          </div>
          {S.hiddenTags.length > 0 && <p className="hint">Đang ẩn {S.hiddenTags.length} lựa chọn: không hiện trong ô chọn và nút gắn tag, nhưng vẫn có trong bộ lọc ghi chú và sắp xếp ở tab Special / Đã bán. Account đã gắn giữ nguyên ghi chú.</p>}
        </section>
        <section className="sec"><h2>Cài đặt</h2>
          <div className="row">
            <label className="fld">Số dòng mỗi file .zip <input className="inp" type="text" inputMode="numeric" style={{ width: 76 }} value={chunk}
              onChange={e => setChunk(e.target.value)} onBlur={() => { S.settings.chunk = Math.max(1, parseInt(chunk) || 100); setChunk(String(S.settings.chunk)); commit() }} /></label>
            <label className="fld">Số dòng mỗi nhóm khi xem và Copy nhóm <input className="inp" type="text" inputMode="numeric" style={{ width: 76 }} value={group}
              onChange={e => setGroup(e.target.value)} onBlur={() => { S.settings.group = Math.max(1, parseInt(group) || 20); setGroup(String(S.settings.group)); commit() }} /></label>
          </div>
          <div className="row"><label className="fld"><input type="checkbox" checked={!!s.crlf} onChange={e => { S.settings.crlf = e.target.checked; commit() }} /> Xuống dòng kiểu Windows (CRLF) trong file .txt</label></div>
        </section>
        <section className="sec"><h2>Sao lưu và khôi phục</h2>
          {isFileStorage()
            ? <p>Dữ liệu được lưu tự động lên server (database) theo tài khoản đăng nhập. Vẫn nên tải file sao lưu thỉnh thoảng.</p>
            : <p>Không kết nối được server nên dữ liệu đang lưu tạm trong trình duyệt (riêng cho từng tài khoản đăng nhập). Hãy chạy bằng <code>npm run dev</code> hoặc <code>npm run preview</code> để lưu, và tải file sao lưu thường xuyên.</p>}
          <div className="row">
            <button className="btn solid" onClick={() => download(`sao-luu-${stamp()}.json`, JSON.stringify(S), 'application/json')}>Tải file sao lưu (.json)</button>
            <label className="btn" style={{ cursor: 'pointer' }}>Khôi phục từ file <input type="file" accept=".json" hidden onChange={restore} /></label>
            <span className="sp" />
            <button className="btn danger" onClick={wipe}>Xoá toàn bộ dữ liệu</button>
          </div>
        </section>
      </div>
    </>
  )
}

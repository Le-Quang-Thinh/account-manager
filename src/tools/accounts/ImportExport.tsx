import { useState } from 'react'
import type { ChangeEvent, ClipboardEvent, ReactNode } from 'react'
import {
  S, save, fresh, normalize, replaceS, isFileStorage, importLines, bulkSpecial, logToSpecial, addTags, removeTag,
  chunkByBatch, chunkByNote, rawText, toCSV, noteOrder, batchIds, batchLabel, deleteBatches, toggleHiddenTag,
} from './store'
import { stamp, download } from '../../shared/lib/browser'
import { makeZip } from '../../shared/lib/zip'
import type { Account, Ctx } from './types'

export default function ImportExport({ ctx, onRestored }: { ctx: Ctx; onRestored: () => void }) {
  const { goTab, commit, toast, setFb, setFs, setSel } = ctx
  const s = S.settings
  const [imp, setImp] = useState('')
  const [impName, setImpName] = useState('')
  const [sp, setSp] = useState('')
  const [spPass, setSpPass] = useState('Gamepika238@') // mật khẩu gắn vào khi dán log từ Google Sheet
  const [tagIn, setTagIn] = useState('')
  const [chunk, setChunk] = useState(String(s.chunk))
  const [group, setGroup] = useState(String(s.group))
  const [delSel, setDelSel] = useState<Set<number>>(() => new Set()) // batch đã chọn để xoá

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
    const r = bulkSpecial(sp)
    commit()
    let msg = `Đã chuyển ${r.n} account sang Special.`
    if (r.created) msg += ` Tạo mới ${r.created} account không có trong danh sách vào ${batchLabel(r.batch!)}.`
    if (r.miss.length) msg += ` Bỏ qua ${r.miss.length} dòng trùng account đã bán (để lại trong ô).`
    setSp(r.miss.join('\n'))
    if (r.created) { goTab('special'); setFb(r.batch!) } // mở luôn batch unknown để thấy account vừa tạo
    toast(msg)
  }
  // Dán log Google Sheet: tự chuẩn hoá thành "username:pass # pokemon_name[_size]" rồi nối vào ô
  const pasteLog = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const r = logToSpecial(e.clipboardData.getData('text'), spPass.trim())
    if (!r) return // không phải log, dán bình thường
    e.preventDefault()
    if (r.lines.length) setSp(v => (v.trim() ? v.replace(/\s*$/, '') + '\n' : '') + r.lines.join('\n'))
    toast(`Đã chuẩn hoá ${r.lines.length} dòng từ log` + (r.skipped ? `, bỏ ${r.skipped} dòng không có username.` : '.'))
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
          <p>Có thể copy thẳng các dòng log từ Google Sheet (kèm hoặc không kèm dòng header) và dán vào: tool tự đổi thành <code>username:mật khẩu # pokemon_name</code>, thêm <code>_XXS</code> / <code>_XXL</code> nếu size là XXS hoặc XXL. Dòng không có username sẽ bị bỏ qua.</p>
          <div className="row">
            <input className="inp" type="text" value={spPass} onChange={e => setSpPass(e.target.value)} placeholder="Mật khẩu khi dán log" aria-label="Mật khẩu gắn vào khi dán log" style={{ minWidth: 230 }} />
          </div>
          <textarea className="ta" style={{ minHeight: 110 }} value={sp} onChange={e => setSp(e.target.value)} onPaste={pasteLog} placeholder={'account5:pass5 # skin hiếm\naccount9 # rank cao\n(hoặc dán log từ Google Sheet)'} aria-label="Danh sách special" />
          <div className="row"><button className="btn star" onClick={doBulk}>Chuyển sang Special</button></div>
        </section>
        <section className="sec"><h2>Xuất file</h2>
          <p>Farm và Danh sách: .zip tách theo batch, mỗi file đúng số dòng đặt bên dưới (tên dạng <code>batch2-farm-01.txt</code>). Special và Đã bán: .zip tách theo ghi chú, mỗi ghi chú một file, nhóm quá dài sẽ chia thêm -p01, -p02.</p>
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

import { useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import {
  S, save, fresh, normalize, replaceS, isFileStorage, importLines, bulkSpecial, addTags, removeTag,
  chunkByBatch, chunkByNote, rawText, toCSV, noteOrder,
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
  const [tagIn, setTagIn] = useState('')
  const [chunk, setChunk] = useState(String(s.chunk))
  const [group, setGroup] = useState(String(s.group))

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
    if (r.miss.length) {
      setSp(r.miss.join('\n'))
      toast(`Đã chuyển ${r.n} account sang Special. Không tìm thấy ${r.miss.length} dòng (để lại trong ô).`)
    } else { setSp(''); toast(`Đã chuyển ${r.n} account sang Special.`) }
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
          <p>Nếu bạn đã có sẵn danh sách special, dán vào đây, mỗi dòng <code>account:password # ghi chú</code> hoặc chỉ tên account. Phần ghi chú sau dấu # có thể bỏ trống. Tool tự tìm account ở mọi batch.</p>
          <textarea className="ta" style={{ minHeight: 110 }} value={sp} onChange={e => setSp(e.target.value)} placeholder={'account5:pass5 # skin hiếm\naccount9 # rank cao'} aria-label="Danh sách special" />
          <div className="row"><button className="btn star" onClick={doBulk}>Chuyển sang Special</button></div>
        </section>
        <section className="sec"><h2>Xuất file</h2>
          <p>Farm và Danh sách: .zip tách theo batch, mỗi file đúng số dòng đặt bên dưới (tên dạng <code>batch2-farm-01.txt</code>). Special và Đã bán: .zip tách theo ghi chú, mỗi ghi chú một file, nhóm quá dài sẽ chia thêm -p01, -p02.</p>
          <div className="row"><B k="zipFarm">Farm .zip</B><B k="zipList">Danh sách .zip</B><B k="zipSpecial">Special .zip</B><B k="zipSold">Đã bán .zip</B></div>
          <div className="row"><B k="txtFarm">Farm .txt</B><B k="txtList">Danh sách .txt</B><B k="txtSpecial">Special .txt</B><B k="txtSold">Đã bán .txt</B></div>
          <div className="row"><B k="csvList">Danh sách .csv</B><B k="csvSpecial">Special .csv</B><B k="csvSold">Đã bán .csv</B>
            <button className="btn" onClick={() => download(`toan-bo-${stamp()}.csv`, toCSV(S.accounts), 'text/csv;charset=utf-8')}>Toàn bộ dữ liệu .csv (kể cả account đã lọc khỏi Danh sách)</button></div>
        </section>
        <section className="sec"><h2>Cài đặt ghi chú: danh sách lựa chọn</h2>
          <p>Ghi chú là danh sách lựa chọn. Nhập các lựa chọn ở đây (cách nhau bằng dấu phẩy), ví dụ <code>pikachu</code>. Ở các tab, ô ghi chú của mỗi dòng là ô chọn: chọn <code>pikachu</code> là xong, account ở Farm sẽ tự chuyển sang Special. Tick nhiều account thì bấm nút lựa chọn trên thanh chọn để gắn cho cả loạt. Xoá một lựa chọn không làm mất ghi chú đã gắn.</p>
          <div className="row">
            <input className="inp" type="text" value={tagIn} onChange={e => setTagIn(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="vd: pikachu, rank cao" style={{ minWidth: 260 }} />
            <button className="btn solid" onClick={addTag}>Thêm lựa chọn</button>
          </div>
          <div className="chips">
            {S.tags.length ? S.tags.map(t => (
              <span key={t} className="chip rm">{t}<button aria-label={`Xoá tag ${t}`} onClick={() => { removeTag(t); commit() }}>×</button></span>
            )) : <span className="none">Chưa có tag nào.</span>}
          </div>
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
            ? <p>Dữ liệu được lưu tự động vào file <code>data/accounts.json</code> trên máy chạy server (bản trước đó nằm ở <code>accounts.json.bak</code>). Vẫn nên tải file sao lưu thỉnh thoảng.</p>
            : <p>Không kết nối được server nên dữ liệu đang lưu tạm trong trình duyệt (theo từng địa chỉ web). Hãy chạy bằng <code>npm run dev</code> hoặc <code>npm run preview</code> để lưu ra file, và tải file sao lưu thường xuyên.</p>}
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

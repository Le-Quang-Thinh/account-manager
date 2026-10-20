import { memo, useDeferredValue, useMemo, useState } from 'react'
import { makeBatches, trimText } from './logic'
import type { TrimAction } from './logic'
import { Badge, CopyButton, InputPane, NumberField } from '../../shared/components/Panes'
import { Icon } from '../../shared/components/Icon'
import { countFilled, countLines, parseIntOr } from '../../shared/lib/lines'
import { download, withTxt } from '../../shared/lib/browser'

interface BatchProps { id: number; content: string; count: number; onTrim: (content: string) => void }

// memo: đổi ô tỉa bên phải không làm vẽ lại hàng trăm lô bên trái
const Batch = memo(function Batch({ id, content, count, onTrim }: BatchProps) {
  return (
    <div className="batch">
      <div className="batch-h">
        <b>Nhóm {id}</b>
        <Badge tone="teal">{count} dòng</Badge>
        <span className="sp" />
        <CopyButton text={content} title={`Copy nhóm ${id}`} />
        <button type="button" className="btn sm teal" onClick={() => onTrim(content)}>Tỉa lô này</button>
      </div>
      <div className="batch-p">{content.split('\n')[0]} ...</div>
    </div>
  )
})

export default function GroupTrimTab({ caseSensitive }: { caseSensitive: boolean }) {
  const [raw, setRaw] = useState('')
  const [batchSize, setBatchSize] = useState('20')
  const [work, setWork] = useState('')
  const [keyword, setKeyword] = useState('')
  const [extra, setExtra] = useState('')
  const [extraName, setExtraName] = useState('')
  const dRaw = useDeferredValue(raw)

  const batches = useMemo(() => makeBatches(dRaw, Math.max(1, parseIntOr(batchSize, 20))), [dRaw, batchSize])
  const run = (action: TrimAction) => setWork(trimText(work, action, keyword, caseSensitive))

  return (
    <div className="grid split">
      {/* Trái: dữ liệu gốc, chia thành các lô để copy */}
      <section className="pane tone-teal">
        <div className="pane-h">
          <h3>Dữ liệu gốc</h3>
          {raw && <Badge tone="teal">{countLines(raw)} dòng</Badge>}
          <span className="sp" />
          {raw && <button type="button" className="btn sm ghost" onClick={() => setRaw('')}>Xóa sạch</button>}
          <label className="btn sm icon-btn upload"><Icon name="upload" size={14} />Tải file lên
            <input type="file" accept=".txt,text/plain" hidden onChange={async e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setRaw(await f.text())
            }} />
          </label>
        </div>
        <div className="bar">
          <NumberField label="Số dòng mỗi lô (để copy):" value={batchSize} onChange={setBatchSize} />
        </div>
        {!raw ? (
          <textarea className="ta-pane" wrap="off" spellCheck={false} value={raw} onChange={e => setRaw(e.target.value)} aria-label="Dữ liệu gốc"
            placeholder="Dán toàn bộ danh sách vào đây, tool tự chia thành các lô nhỏ..." />
        ) : (
          <div className="batches">
            {batches.map(b => <Batch key={b.id} id={b.id} content={b.content} count={b.count} onTrim={setWork} />)}
          </div>
        )}
      </section>

      {/* Phải: khu vực tỉa file */}
      <div className="stack">
        <section className="pane tone-slate">
          <div className="pane-h">
            <h3>Khu vực tỉa file</h3>
            <Badge>{countFilled(work)} dòng</Badge>
            <span className="sp" />
            <button type="button" className="btn sm ghost" onClick={() => setWork('')}>Xóa sạch</button>
            <CopyButton text={work} />
          </div>
          <div className="bar col">
            <div className="row">
              <button type="button" className="btn sm" onClick={() => run('empty')}>Xóa dòng trống</button>
              <button type="button" className="btn sm" onClick={() => run('dupe')}>Lọc trùng lặp</button>
            </div>
            <div className="row">
              <input className="inp grow" type="text" placeholder="Từ khóa, ví dụ ERROR hoặc @gmail" aria-label="Từ khóa"
                value={keyword} onChange={e => setKeyword(e.target.value)} />
              <button type="button" className="btn sm danger" disabled={!keyword} onClick={() => run('remove_kw')}>Xóa dòng chứa từ khóa</button>
              <button type="button" className="btn sm sell" disabled={!keyword} onClick={() => run('keep_kw')}>Chỉ giữ dòng chứa từ khóa</button>
            </div>
          </div>
          <textarea className="ta-pane" wrap="off" spellCheck={false} value={work} onChange={e => setWork(e.target.value)} aria-label="Khu vực tỉa file"
            placeholder="Dán text cần tỉa vào đây, hoặc bấm Tỉa lô này ở cột bên trái..." />
        </section>
        <InputPane title="Ô nhập thêm và lưu file" tone="teal" count={countFilled(extra)} value={extra} onChange={setExtra}
          placeholder="Bấm Lấy dữ liệu gốc để copy cả danh sách sang đây, rồi dán thêm hoặc chỉnh sửa..."
          headExtra={<button type="button" className="btn sm" onClick={() => setExtra(raw)}>Lấy dữ liệu gốc</button>}>
          <div className="bar">
            <CopyButton text={extra} />
            <input className="inp name-in" type="text" placeholder="Tên file" aria-label="Tên file" value={extraName} onChange={e => setExtraName(e.target.value)} />
            <button type="button" className="btn sm solid icon-btn" disabled={!extra}
              onClick={() => download(withTxt(extraName, 'group_trim_extra.txt'), extra)}><Icon name="download" size={14} />Lưu file</button>
          </div>
        </InputPane>
      </div>
    </div>
  )
}

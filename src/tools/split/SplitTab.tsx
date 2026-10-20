import { useDeferredValue, useMemo, useState } from 'react'
import { splitIntoChunks } from './logic'
import type { SplitMethod } from './logic'
import { Badge, InputPane, NumberField } from '../../shared/components/Panes'
import { Icon } from '../../shared/components/Icon'
import { parseIntOr, toText } from '../../shared/lib/lines'
import { download } from '../../shared/lib/browser'
import { makeZip } from '../../shared/lib/zip'

export default function SplitTab({ caseSensitive }: { caseSensitive: boolean }) {
  const [raw, setRaw] = useState('')
  const [dedupe, setDedupe] = useState(false)
  const [method, setMethod] = useState<SplitMethod>('by_files')
  const [num, setNum] = useState('5')
  const [multiple, setMultiple] = useState('20')
  const [baseName, setBaseName] = useState('text')
  const dRaw = useDeferredValue(raw)

  const data = useMemo(() => splitIntoChunks(dRaw, {
    dedupe, method, caseSensitive, num: parseIntOr(num), multiple: parseIntOr(multiple),
  }), [dRaw, dedupe, method, num, multiple, caseSensitive])

  const base = baseName.trim() || 'text'
  const files = useMemo(() => data.chunks.map((chunk, i) => ({ name: `${base}_${i + 1}.txt`, text: toText(chunk) })), [data.chunks, base])

  return (
    <div className="grid split">
      <InputPane title="Văn bản cần tách" tone="teal" count={data.total} value={raw} onChange={setRaw}
        placeholder="Dán danh sách vào đây, hoặc tải file .txt lên..." onClear={() => setRaw('')} minHeight={380}>
        <div className="bar col">
          <div className="seg" role="group" aria-label="Cách tách">
            <button type="button" className={method === 'by_files' ? 'on' : ''} aria-pressed={method === 'by_files'} onClick={() => setMethod('by_files')}>Chia thành N file</button>
            <button type="button" className={method === 'by_lines' ? 'on' : ''} aria-pressed={method === 'by_lines'} onClick={() => setMethod('by_lines')}>Mỗi file N dòng</button>
          </div>
          <div className="row">
            <NumberField label={method === 'by_files' ? 'Số file:' : 'Số dòng mỗi file:'} value={num} onChange={setNum} />
            {method === 'by_files' && <NumberField label="Làm tròn theo bội số của:" value={multiple} onChange={setMultiple} />}
            <label className="fld"><input type="checkbox" checked={dedupe} onChange={e => setDedupe(e.target.checked)} /> Lọc trùng trước khi tách</label>
          </div>
          {dedupe && data.total > 0 && <p className="note">Sau khi lọc trùng còn {data.afterDedupe} trên {data.total} dòng.</p>}
        </div>
      </InputPane>

      <section className="pane tone-slate">
        <div className="pane-h">
          <h3>Kết quả</h3>
          <Badge>{data.chunks.length} file</Badge>
          <span className="sp" />
          <input className="inp name-in" type="text" aria-label="Tên gốc của file" placeholder="Tên gốc" value={baseName} onChange={e => setBaseName(e.target.value)} />
          <button type="button" className="btn sm solid icon-btn" disabled={!files.length} onClick={() => download(`${base}_split.zip`, makeZip(files))}>
            <Icon name="download" size={14} />Tải .zip
          </button>
        </div>
        {!files.length ? <p className="pane-empty">Dán dữ liệu bên trái, các file sẽ hiện ở đây.</p> : (
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={f.name}>
                <span className="mono">{f.name}</span>
                <span className="dim">{data.chunks[i].length} dòng</span>
                <span className="sp" />
                <button type="button" className="btn sm" onClick={() => download(f.name, f.text)}>Tải</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

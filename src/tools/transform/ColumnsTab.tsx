import { useDeferredValue, useMemo, useState } from 'react'
import { extractColumns } from './logic'
import { InputPane, OutputPane } from '../../shared/components/Panes'
import { countFilled } from '../../shared/lib/lines'

export default function ColumnsTab() {
  const [raw, setRaw] = useState('')
  const [delimiter, setDelimiter] = useState('\\t')
  const [keep, setKeep] = useState('1, 2')
  const [outSeparator, setOutSeparator] = useState(':')
  const dRaw = useDeferredValue(raw)
  const result = useMemo(() => extractColumns(dRaw, delimiter, keep, outSeparator), [dRaw, delimiter, keep, outSeparator])

  return (
    <div className="stack">
      <p className="note">Dán dữ liệu dạng bảng (copy từ Excel hoặc file có ký tự phân cách). Nhập số cột cần giữ, cách nhau bằng dấu phẩy, ví dụ <code>1, 3</code>. Dùng <code>\t</code> cho dấu Tab.</p>
      <div className="bar toolbar">
        <label className="fld">Ký tự phân cách cột:
          <input className="inp" type="text" style={{ width: 80 }} value={delimiter} onChange={e => setDelimiter(e.target.value)} />
        </label>
        <label className="fld">Giữ cột số:
          <input className="inp" type="text" style={{ width: 110 }} value={keep} onChange={e => setKeep(e.target.value)} />
        </label>
        <label className="fld">Nối bằng:
          <input className="inp" type="text" style={{ width: 64 }} value={outSeparator} onChange={e => setOutSeparator(e.target.value)} />
        </label>
      </div>
      <div className="grid two">
        <InputPane title="Dữ liệu bảng" tone="slate" count={countFilled(raw)} value={raw} onChange={setRaw}
          onClear={() => setRaw('')} placeholder="Dán dữ liệu nhiều cột vào đây..." minHeight={340} />
        <OutputPane title="Kết quả" tone="teal" text={result} count={countFilled(result)} defaultName="columns.txt" minHeight={340} />
      </div>
    </div>
  )
}

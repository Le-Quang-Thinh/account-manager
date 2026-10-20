import { useDeferredValue, useMemo, useState } from 'react'
import { splitGlued } from './logic'
import { InputPane, OutputPane } from '../../shared/components/Panes'
import { countFilled } from '../../shared/lib/lines'

export default function ConvertTab() {
  const [raw, setRaw] = useState('')
  const [delimiter, setDelimiter] = useState('Gamepika238@')
  const [separator, setSeparator] = useState(':')
  const dRaw = useDeferredValue(raw)
  const result = useMemo(() => splitGlued(dRaw, delimiter, separator), [dRaw, delimiter, separator])

  return (
    <div className="stack">
      <p className="note">Cắt chuỗi theo <b>phần đuôi cố định</b> (thường là mật khẩu), rồi ghép lại thành <code>tài khoản{separator}đuôi</code>. Ví dụ <code>userAGamepika238@userBGamepika238@</code> thành hai dòng.</p>
      <div className="bar toolbar">
        <label className="fld">Đuôi cố định:
          <input className="inp" type="text" style={{ width: 200 }} value={delimiter} onChange={e => setDelimiter(e.target.value)} />
        </label>
        <label className="fld">Ký tự nối:
          <input className="inp" type="text" style={{ width: 64 }} value={separator} onChange={e => setSeparator(e.target.value)} />
        </label>
      </div>
      <div className="grid two">
        <InputPane title="Chuỗi dính liền" tone="slate" count={countFilled(raw)} value={raw} onChange={setRaw}
          onClear={() => setRaw('')} placeholder="Dán chuỗi dính liền vào đây..." minHeight={340} />
        <OutputPane title="Kết quả" tone="teal" text={result} count={countFilled(result)} defaultName="converted.txt" minHeight={340} />
      </div>
    </div>
  )
}

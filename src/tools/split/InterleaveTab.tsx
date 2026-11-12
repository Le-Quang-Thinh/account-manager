import { memo, useDeferredValue, useMemo, useState } from 'react'
import { interleaveByMachine } from './logic'
import { Badge, CopyButton, InputPane, NumberField, OutputPane } from '../../shared/components/Panes'
import { Icon } from '../../shared/components/Icon'
import { parseIntOr, splitLines, toText } from '../../shared/lib/lines'
import { download, withTxt } from '../../shared/lib/browser'

// Dựng ma trận minh họa (số thứ tự gốc, 1-indexed) để người dùng thấy cách đọc "theo hàng".
// Rút gọn bằng dấu … khi quá nhiều cột/hàng.
function pickIdx(n: number, maxHead = 3): (number | null)[] {
  if (n <= maxHead + 1) return Array.from({ length: n }, (_, i) => i)
  return [...Array.from({ length: maxHead }, (_, i) => i), null, n - 1]
}

function Matrix({ machines, per }: { machines: number; per: number }) {
  const cols = pickIdx(machines)
  const rows = pickIdx(per, 2)
  const cell = (row: number | null, col: number | null) =>
    row === null || col === null ? '…' : String(col * per + row + 1) // vị trí gốc, 1-indexed
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="mtx">
        <thead>
          <tr>
            <th />
            {cols.map((c, i) => <th key={i}>{c === null ? '…' : `Máy ${c + 1}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <th>{r === null ? '…' : `Dòng ${r + 1}`}</th>
              {cols.map((c, ci) => <td key={ci}>{cell(r, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface MachineProps { id: number; content: string; count: number }
// memo: nhiều máy không vẽ lại lẫn nhau
const Machine = memo(function Machine({ id, content, count }: MachineProps) {
  return (
    <div className="batch">
      <div className="batch-h">
        <b>Máy {id}</b>
        <Badge tone="teal">{count} acc</Badge>
        <span className="sp" />
        <CopyButton text={content} title={`Copy máy ${id}`} />
        <button type="button" className="btn sm icon-btn" title={`Tải máy ${id}`}
          onClick={() => download(`may_${id}.txt`, content)}><Icon name="download" size={14} /></button>
      </div>
      <textarea className="ta-pane out" wrap="off" spellCheck={false} readOnly
        aria-label={`Máy ${id}`} value={content} />
    </div>
  )
})

export default function InterleaveTab() {
  const [raw, setRaw] = useState('')
  const [machines, setMachines] = useState('20')
  const [dropEmpty, setDropEmpty] = useState(true)
  const [allName, setAllName] = useState('')
  const dRaw = useDeferredValue(raw)

  const nMachines = Math.max(1, parseIntOr(machines, 1))
  const r = useMemo(() => interleaveByMachine(dRaw, nMachines, dropEmpty), [dRaw, nMachines, dropEmpty])

  // Chia kết quả đã xen kẽ thành từng máy (mỗi máy `per` dòng liên tục)
  const perMachine = useMemo(() => {
    if (!r.result) return [] as MachineProps[]
    const lines = splitLines(r.result)
    const out: MachineProps[] = []
    for (let i = 0, id = 1; i < lines.length; i += r.perMachine, id++) {
      const chunk = lines.slice(i, i + r.perMachine)
      out.push({ id, content: toText(chunk), count: chunk.length })
    }
    return out
  }, [r.result, r.perMachine])

  // Ma trận minh họa: dùng số liệu thật nếu đã có dữ liệu, không thì mặc định 20 máy × 50 dòng
  const demoPer = r.total ? r.perMachine : 50
  const demoMachines = r.total ? r.blockCount : nMachines

  return (
    <>
      <section className="pane tone-slate" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <p className="note" style={{ marginBottom: 8 }}>
          <b>Cách hoạt động:</b> danh sách gốc đang được đọc <b>theo cột</b> (dọc từng máy):
          máy 1 là <code>1…50</code>, máy 2 là <code>51…100</code>… Tab này <b>đọc lại theo hàng</b> (ngang):
          lấy dòng đầu của tất cả các máy trước, rồi tới dòng 2 của tất cả các máy…
          Kết quả: <code>1, 51, 101, …, 951, 2, 52, 102, …, 952, …</code>
        </p>
        <Matrix machines={demoMachines} per={demoPer} />
        <p className="note" style={{ marginTop: 8 }}>
          Số trong ô là <b>vị trí gốc</b> của acc. Thứ tự mới = đọc bảng <b>từng hàng, trái→phải</b>.
        </p>
      </section>

      <div className="grid split" style={{ marginTop: 12 }}>
        {/* Trái: danh sách acc (nhập) + kết quả xen kẽ, xếp dọc */}
        <div className="stack">
          <InputPane
            title="Danh sách acc (đã xếp theo máy)"
            tone="teal"
            value={raw}
            onChange={setRaw}
            count={r.total}
            onClear={raw ? () => setRaw('') : undefined}
            placeholder="Dán danh sách acc đã xếp theo máy, hoặc tải file .txt lên..."
            minHeight={160}
          >
            <div className="bar">
              <NumberField label="Số máy:" value={machines} onChange={setMachines} />
              <label className="fld case-toggle">
                <input type="checkbox" checked={dropEmpty} onChange={e => setDropEmpty(e.target.checked)} />
                Bỏ dòng trống
              </label>
              <span className="sp" />
              {r.total > 0 && (
                <span className="muted" style={{ fontSize: 13 }}>
                  <Badge tone="slate">{r.blockCount} máy</Badge> × <Badge tone="slate">{r.perMachine} dòng/máy</Badge>
                </span>
              )}
            </div>
          </InputPane>

          <OutputPane
            title="Kết quả xen kẽ"
            tone="teal"
            text={r.result}
            count={r.total}
            defaultName="xen_ke.txt"
            minHeight={300}
          />
        </div>

        {/* Phải: chia kết quả thành từng máy, mỗi máy một ô text dài */}
        <section className="pane tone-slate">
          <div className="pane-h">
            <h3>Chia theo máy</h3>
            {r.total > 0 && <Badge tone="slate">{perMachine.length} máy</Badge>}
            <span className="sp" />
            <input className="inp" type="text" style={{ width: 110 }} placeholder="ten_file" aria-label="Tên file tải tất cả"
              value={allName} onChange={e => setAllName(e.target.value)} />
            <button type="button" className="btn sm solid icon-btn" disabled={!r.result}
              onClick={() => download(withTxt(allName, 'xen_ke.txt'), r.result)}>
              <Icon name="download" size={14} />Tải tất cả
            </button>
          </div>
          {perMachine.length === 0 ? (
            <p className="note" style={{ padding: 14 }}>Nhập danh sách ở bên trái để chia thành {nMachines} máy.</p>
          ) : (
            <div className="mcards tall">
              {perMachine.map(m => <Machine key={m.id} id={m.id} content={m.content} count={m.count} />)}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

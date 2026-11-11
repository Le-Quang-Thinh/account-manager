import { useDeferredValue, useMemo, useState } from 'react'
import { reorderByMachine } from './logic'
import { Badge, InputPane, NumberField, OutputPane } from '../../shared/components/Panes'
import { parseIntOr } from '../../shared/lib/lines'

export default function SortMachineTab() {
  const [raw, setRaw] = useState('')
  const [machines, setMachines] = useState('40')
  const [head, setHead] = useState('50')
  const [dropEmpty, setDropEmpty] = useState(true)
  const dRaw = useDeferredValue(raw)

  const r = useMemo(
    () => reorderByMachine(dRaw, Math.max(1, parseIntOr(machines, 1)), Math.max(0, parseIntOr(head, 0)), dropEmpty),
    [dRaw, machines, head, dropEmpty],
  )

  return (
    <>
      <InputPane
        title="Danh sách acc (đã xếp theo máy)"
        tone="teal"
        value={raw}
        onChange={setRaw}
        count={r.total}
        onClear={raw ? () => setRaw('') : undefined}
        placeholder="Dán danh sách acc đã xếp theo máy (mỗi máy là một block liên tục)..."
        minHeight={180}
      >
        <div className="bar">
          <NumberField label="Số dòng đầu/máy đã chạy:" value={head} onChange={setHead} />
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

      <div className="grid three" style={{ marginTop: 12 }}>
        <OutputPane title="Đầu ra (ưu tiên)" tone="teal" text={r.heads} count={r.headCount} defaultName="dau_ra.txt" minHeight={240} />
        <OutputPane title="Còn lại (chờ)" tone="amber" text={r.tails} count={r.tailCount} defaultName="con_lai.txt" minHeight={240} />
        <OutputPane title="Đã sort (tham khảo)" tone="slate" text={r.sorted} count={r.total} defaultName="da_sort.txt" minHeight={240} />
      </div>
    </>
  )
}

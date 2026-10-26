import { useState } from 'react'
import { S, batchIds, batchLabel, farmCount, addToBatch } from './store'
import type { BatchFilter } from './types'

interface Props {
  fb: BatchFilter
  onClose: () => void
  onDone: (batch: number | null, msg: string) => void
}

// Thêm account vào batch có sẵn (bù cho batch bị lẻ sau khi lọc Special) hoặc tạo batch mới
export default function AddPanel({ fb, onClose, onDone }: Props) {
  const ids = batchIds()
  const target = S.settings.group
  const initial = typeof fb === 'number' ? fb : (ids.find(b => { const n = farmCount(b); return n > 0 && n < target }) ?? 0)
  const [batch, setBatch] = useState(initial)
  const [text, setText] = useState('')
  const lines = text.split(/\r?\n/).filter(l => l.trim()).length
  const cur = batch ? farmCount(batch) : 0

  const submit = () => {
    const r = addToBatch(text, batch)
    if (!r.add && !r.moved) { onDone(null, r.dup ? `Không thêm được: ${r.dup} dòng trùng tên tài khoản.` : 'Chưa có dòng nào để thêm.'); return }
    const parts = [r.add && `thêm mới ${r.add}`, r.moved && `chuyển ${r.moved} từ batch khác`].filter(Boolean).join(', ')
    onDone(r.batch, `Batch ${r.batch}: ${parts}` + (r.dup ? `, bỏ qua ${r.dup} dòng trùng.` : '.'))
  }

  return (
    <div className="addpanel">
      <div className="addpanel-row">
        <label>Thêm vào
          <select value={batch} onChange={e => setBatch(+e.target.value)}>
            {ids.map(b => <option key={b} value={b}>{batchLabel(b)} ({farmCount(b)} Farm)</option>)}
            <option value={0}>Batch mới</option>
          </select>
        </label>
        {batch > 0 && <span className="hint-inline">Hiện có {cur} Farm{cur < target ? `, còn thiếu ${target - cur} để đủ ${target}` : ''}.</span>}
      </div>
      <textarea rows={5} spellCheck={false} placeholder="Dán account, mỗi dòng một account (account:password…)"
        value={text} onChange={e => setText(e.target.value)} aria-label="Danh sách account cần thêm" />
      <div className="addpanel-row">
        <button className="btn solid" disabled={!lines} onClick={submit}>Thêm {lines || ''} account</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </div>
    </div>
  )
}

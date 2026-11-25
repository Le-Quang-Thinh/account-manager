import { S, batchIds } from './store'
import { fmtShort } from '../../shared/lib/browser'
import type { BatchFilter } from './types'

interface Props {
  fb: BatchFilter
  setFb: (b: BatchFilter) => void
  batchCount: (b: number) => number
  scopeCount: number
}

export default function BatchSidebar({ fb, setFb, batchCount, scopeCount }: Props) {
  const ids = batchIds()
  const allOn = fb.size === 0 // không chọn batch nào = hiện tất cả
  const toggle = (b: number) => {
    const n = new Set(fb)
    if (n.has(b)) n.delete(b); else n.add(b)
    setFb(n)
  }
  return (
    <aside className="batch-side" aria-label="Lọc theo batch">
      <div className="side-h">
        <span>Batch</span>
        {!allOn && <button type="button" className="side-clear" onClick={() => setFb(new Set())}>Bỏ chọn ({fb.size})</button>}
      </div>
      <div className="side-list">
        <button type="button" className={'bt all ' + (allOn ? 'on' : '')} aria-pressed={allOn} onClick={() => setFb(new Set())}>
          <span className="bt-n">Tất cả batch</span><span className="bt-c">{scopeCount}</span>
        </button>
        {ids.map(b => {
          const m = S.batchMeta[b]
          const on = fb.has(b)
          return (
            <label key={b} className={'bt bt-check ' + (on ? 'on' : '')}>
              <input type="checkbox" checked={on} onChange={() => toggle(b)} aria-label={'Batch ' + b} />
              <span className="bt-body">
                <span className="bt-n">Batch {b}{m?.name ? <> <i>{m.name}</i></> : null}</span>
                <span className="bt-d">{m?.at ? 'nhập ' + fmtShort(m.at) : ''}</span>
              </span>
              <span className="bt-c">{batchCount(b)}</span>
            </label>
          )
        })}
      </div>
    </aside>
  )
}

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
  return (
    <aside className="batch-side" aria-label="Lọc theo batch">
      <div className="side-h">Batch</div>
      <div className="side-list">
        <button type="button" className={'bt ' + (fb === 'all' ? 'on' : '')} aria-pressed={fb === 'all'} onClick={() => setFb('all')}>
          <span className="bt-n">Tất cả batch</span><span className="bt-c">{scopeCount}</span>
        </button>
        {batchIds().map(b => {
          const m = S.batchMeta[b]
          return (
            <button key={b} type="button" className={'bt ' + (fb === b ? 'on' : '')} aria-pressed={fb === b} onClick={() => setFb(b)}>
              <span className="bt-n">Batch {b}{m?.name ? <> <i>{m.name}</i></> : null}</span>
              <span className="bt-d">{m?.at ? 'nhập ' + fmtShort(m.at) : ''}</span>
              <span className="bt-c">{batchCount(b)}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

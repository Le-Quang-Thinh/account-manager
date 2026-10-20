import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { filterByKeyword, highlightSegments } from './logic'
import { InputPane, OutputPane } from '../../shared/components/Panes'

export default function SpecialTab({ caseSensitive }: { caseSensitive: boolean }) {
  const [raw, setRaw] = useState('')
  const [keyword, setKeyword] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [dedupe, setDedupe] = useState(true)
  const [fileCount, setFileCount] = useState(0)
  const backdrop = useRef<HTMLDivElement>(null)
  const dRaw = useDeferredValue(raw)
  const dKeyword = useDeferredValue(keyword)

  const data = useMemo(() => filterByKeyword(dRaw, dKeyword, isRegex, caseSensitive, dedupe), [dRaw, dKeyword, isRegex, caseSensitive, dedupe])
  const segments = useMemo(() => highlightSegments(dRaw, dKeyword, isRegex, caseSensitive), [dRaw, dKeyword, isRegex, caseSensitive])

  return (
    <div className="stack">
      <div className="bar toolbar">
        <input className="inp grow" type="text" aria-label="Từ khóa hoặc regex" value={keyword} onChange={e => setKeyword(e.target.value)}
          placeholder={isRegex ? 'Nhập regex, ví dụ @(gmail|yahoo)\\.com$' : 'Nhập từ khóa để tách (để trống = chỉ lọc trùng)'} />
        <label className="fld"><input type="checkbox" checked={isRegex} onChange={e => setIsRegex(e.target.checked)} /> Regex</label>
        <label className="fld"><input type="checkbox" checked={dedupe} onChange={e => setDedupe(e.target.checked)} /> Lọc trùng kết quả</label>
        {data.error && <span className="err" role="alert">Regex không hợp lệ: {data.error}</span>}
      </div>
      <div className="grid three">
        <InputPane title="Dữ liệu gốc" tone="slate" count={data.total} value={raw}
          onChange={v => { setRaw(v); setFileCount(0) }} multiple uploadLabel="Tải nhiều file"
          onFiles={(texts, files) => { setRaw(texts.join('\n')); setFileCount(files.length) }}
          onClear={() => { setRaw(''); setFileCount(0) }}
          headExtra={fileCount > 0 ? <span className="dim">{fileCount} file</span> : null}
          // lớp tô sáng nằm sau textarea trong suốt; cuộn đồng bộ bằng onScroll
          field={(
            <div className="hl">
              <div className="hl-back" ref={backdrop} aria-hidden="true">
                {segments.map((s, i) => s.hit ? <mark key={i}>{s.text}</mark> : s.text)}{dRaw.endsWith('\n') ? ' ' : null}
              </div>
              <textarea className="ta-pane hl-front" wrap="off" spellCheck={false} value={raw} aria-label="Dữ liệu gốc"
                placeholder="Dán dữ liệu hoặc tải nhiều file .txt lên (sẽ được gộp lại)..."
                onChange={e => { setRaw(e.target.value); setFileCount(0) }}
                onScroll={e => {
                  const b = backdrop.current
                  if (b) { b.scrollTop = e.currentTarget.scrollTop; b.scrollLeft = e.currentTarget.scrollLeft }
                }} />
            </div>
          )} />
        <OutputPane title={keyword ? 'Dòng khớp' : 'Kết quả'} tone="teal" text={data.result} count={data.matched} defaultName="special.txt" />
        <OutputPane title="Dòng còn lại" tone="amber" text={data.remaining} count={data.remainingCount} defaultName="remaining.txt" />
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'

const POS_KEY = 'accmgr_floattags_pos'
const MIN_KEY = 'accmgr_floattags_min'
type Pos = { x: number; y: number }

const load = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch (e) { return null } }
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { /* bỏ qua */ } }

// Bảng nổi gắn tag nhanh cho các account đang chọn: bấm chip hoặc phím 1-9; kéo ở thanh tiêu đề để dời chỗ.
export default function FloatTags({ tags, count, onTag, onCreate, onClear }: {
  tags: string[]; count: number; onTag: (t: string) => void; onCreate: (t: string) => void; onClear: () => void
}) {
  const [draft, setDraft] = useState('')
  const [pos, setPos] = useState<Pos | null>(() => load<Pos>(POS_KEY))
  const [min, setMin] = useState<boolean>(() => !!load<boolean>(MIN_KEY))
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!count) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]')) return
      const n = /^[1-9]$/.test(e.key) ? +e.key : 0
      if (n && tags[n - 1]) { e.preventDefault(); onTag(tags[n - 1]) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [count, tags, onTag])

  if (!count) return null

  const create = () => {
    const t = draft.trim()
    if (!t) return
    setDraft('')
    onCreate(t)
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    const r = box.current!.getBoundingClientRect()
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current, b = box.current
    if (!d || !b) return
    setPos({
      x: Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - b.offsetWidth),
      y: Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - b.offsetHeight),
    })
  }
  const up = () => { if (drag.current) { drag.current = null; if (pos) store(POS_KEY, pos) } }
  const toggleMin = () => { setMin(m => { store(MIN_KEY, !m); return !m }) }

  return (
    <div ref={box} className={'float-tags' + (min ? ' min' : '')} role="region" aria-label="Gắn tag nhanh"
      style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}>
      <div className="ft-h" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <b>{count}</b> đã chọn
        <span className="sp" />
        <button type="button" className="ft-x" aria-label={min ? 'Mở rộng' : 'Thu gọn'} title={min ? 'Mở rộng' : 'Thu gọn'} onClick={toggleMin}>{min ? '▢' : '–'}</button>
        <button type="button" className="ft-x" aria-label="Bỏ chọn" title="Bỏ chọn" onClick={onClear}>×</button>
      </div>
      {!min && (
        <>
          {tags.length > 0 && (
            <div className="ft-b">
              {tags.map((t, i) => (
                <button key={t} type="button" className="chip" title={`Gắn tag "${t}"` + (i < 9 ? ` (phím ${i + 1})` : '')} onClick={() => onTag(t)}>
                  {i < 9 && <kbd>{i + 1}</kbd>}{t}
                </button>
              ))}
            </div>
          )}
          <form className="ft-new" onSubmit={e => { e.preventDefault(); create() }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ghi chú mới…" aria-label="Tên ghi chú mới" maxLength={60} />
            <button type="submit" className="btn" disabled={!draft.trim()} title="Tạo ghi chú mới và gắn cho các account đã chọn">Tạo và gắn</button>
          </form>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { copyText } from '../../shared/lib/browser'
import { normalize, pull, push } from './sync'
import type { Item, Notes } from './sync'

type Kind = 'search' | 'coords'
type Mutate = (kind: Kind, fn: (items: Item[]) => Item[]) => void
type Sync = 'saved' | 'saving' | 'error' | 'offline'
const SYNC_TEXT: Record<Sync, string> = {
  saved: '· Đã lưu lên server',
  saving: '· Đang lưu…',
  error: '· Chưa lưu được lên server, hãy thử lại',
  offline: '· Không kết nối được server, dữ liệu sẽ không được lưu',
}

const SEED: Notes = normalize({
  search: [{
    id: 'seed-1',
    title: 'Xóa pkm dưới 1k cp',
    text: '-999&0*,1*&!shiny&!xxl&!xxs&!lucky&!legendary&!mythical&!ultrabeast&!shadow&!purified&!costume&!evolvenew',
  }],
})

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function Section({ kind, heading, titleHolder, textHolder, items, mutate, disabled, toast }: {
  kind: Kind; heading: string; titleHolder: string; textHolder: string
  items: Item[]; mutate: Mutate; disabled: boolean; toast: (m: string) => void
}) {
  // draft = null: đang đóng form; id rỗng: thêm mới; có id: đang sửa
  const [draft, setDraft] = useState<Item | null>(null)
  const copy = (x: Item) => copyText(x.text).then(() => toast('Đã copy'), () => toast('Không copy được'))
  const remove = (x: Item) => {
    if (window.confirm(`Xóa "${x.title || 'chưa đặt tên'}"? Không hoàn tác được.`)) mutate(kind, l => l.filter(y => y.id !== x.id))
  }
  const save = (f: FormEvent) => {
    f.preventDefault()
    if (!draft) return
    const d = { ...draft, title: draft.title.trim(), text: draft.text.trim() }
    if (!d.title && !d.text) return
    mutate(kind, l => (d.id ? l.map(x => (x.id === d.id ? d : x)) : [...l, { ...d, id: newId() }]))
    setDraft(null)
  }

  return (
    <section className="pane">
      <div className="pane-h">
        <h3>{heading}</h3>
        {!draft && <button type="button" className="btn sm teal" disabled={disabled} onClick={() => setDraft({ id: '', title: '', text: '' })}>+ Thêm</button>}
      </div>
      <div className="en-pad">
        {draft && (
          <form className="nt-form" onSubmit={save}>
            <input className="inp" type="text" autoFocus placeholder={titleHolder} aria-label="Title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
            <textarea className="ta-pane" spellCheck={false} placeholder={textHolder} aria-label="Description" value={draft.text} onChange={e => setDraft({ ...draft, text: e.target.value })} />
            <div className="nt-foot">
              <span className="sp" />
              <button type="button" className="btn sm" onClick={() => setDraft(null)}>Hủy</button>
              <button type="submit" className="btn sm teal" disabled={!draft.title.trim() && !draft.text.trim()}>Lưu</button>
            </div>
          </form>
        )}
        {items.length === 0 && !draft && <p className="pane-empty">Chưa có mục nào. Bấm + Thêm.</p>}
        {items.length > 0 && (
          <table className="nt-table">
            <thead>
              <tr><th className="c-n">#</th><th className="c-t">Title</th><th>Description</th><th className="c-a" /></tr>
            </thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.id}>
                  <td className="c-n">{i + 1}</td>
                  <td className="c-t" title={x.title}>{x.title}</td>
                  <td className="c-d" title={x.text}>{x.text}</td>
                  <td className="c-a">
                    <button type="button" className="btn sm teal" disabled={!x.text} onClick={() => copy(x)}>Copy</button>
                    <button type="button" className="btn sm" onClick={() => setDraft(x)}>Sửa</button>
                    <button type="button" className="btn sm ghost danger" onClick={() => remove(x)}>Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default function NotesTool({ toast }: { toast: (m: string) => void }) {
  const [notes, setNotes] = useState<Notes>(SEED)
  const [ready, setReady] = useState(false)
  const [sync, setSync] = useState<Sync>('saved')
  const server = useRef<{ rev: number; notes: Notes }>({ rev: 0, notes: SEED }) // bản mới nhất đã biết trên server
  const online = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)

  const adopt = useCallback((r: { rev: number; notes: Notes }) => {
    server.current = r
    setNotes(r.notes)
  }, [])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    pull()
      .then(r => { online.current = true; if (r) adopt(r) })
      .catch(() => setSync('offline'))
      .finally(() => setReady(true))
  }, [adopt])

  // Mỗi thao tác áp lên bản mới nhất của server; nếu người khác vừa sửa (409) thì lấy bản mới rồi áp lại
  const run = useCallback(async (fn: (n: Notes) => Notes) => {
    for (let i = 0; i < 3; i++) {
      const base = server.current
      const next = fn(base.notes)
      const r = await push(base.rev, next)
      if (r.ok) { server.current = { rev: r.rev, notes: next }; return true }
      if (r.unauthorized) {
        window.alert('Phiên đăng nhập đã hết hạn, trang sẽ tải lại để đăng nhập.')
        location.reload()
        return false
      }
      if (!r.conflict) return false
      const fresh = await pull().catch(() => null)
      if (!fresh) return false
      server.current = fresh
    }
    return false
  }, [])

  const mutate = useCallback((kind: Kind, fn: (items: Item[]) => Item[]) => {
    const apply = (n: Notes): Notes => ({ ...n, [kind]: fn(n[kind]) })
    setNotes(apply) // hiện ngay, rồi đồng bộ lại theo kết quả từ server
    pending.current++
    setSync('saving')
    queue.current = queue.current.then(async () => {
      const ok = await run(apply)
      if (--pending.current === 0) {
        setNotes(server.current.notes)
        setSync(ok ? 'saved' : 'error')
      }
      if (!ok) toast('Chưa lưu được lên server, dữ liệu vừa sửa sẽ được tải lại')
    })
  }, [run, toast])

  // quay lại tab: lấy bản mới của người khác nếu không có thao tác đang lưu
  useEffect(() => {
    if (!ready) return
    const refresh = async () => {
      if (document.hidden || !online.current || pending.current) return
      const r = await pull().catch(() => null)
      if (r && r.rev !== server.current.rev && !pending.current) adopt(r)
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [ready, adopt])

  if (!ready) return <p className="loading" role="status">Đang tải dữ liệu…</p>
  const disabled = !online.current
  return (
    <div className="ev">
      <div className="ev-top">
        <h1>Ghi chú</h1>
        <p className="sub"><span className="dim">{SYNC_TEXT[sync]}</span></p>
      </div>
      <Section kind="search" heading="Code search Pokémon GO" titleHolder="Tên, vd. Xóa pkm dưới 1k cp" textHolder="Code search, vd. -999&0*,1*&!shiny…" items={notes.search} mutate={mutate} disabled={disabled} toast={toast} />
      <Section kind="coords" heading="List tọa độ" titleHolder="Tên địa điểm" textHolder="Nhập tọa độ, mỗi dòng một tọa độ, vd. 10.7769, 106.7009" items={notes.coords} mutate={mutate} disabled={disabled} toast={toast} />
    </div>
  )
}

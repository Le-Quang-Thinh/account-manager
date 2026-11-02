import { Activity, useCallback, useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PageHead, SubTabs } from '../../shared/components/Layout'
import type { SubTabItem } from '../../shared/components/Layout'
import { copyText } from '../../shared/lib/browser'
import { readStored, writeStored } from '../../shared/lib/storage'
import {
  CITIES, FOCUS, LOCAL_TZ, circDist, cityKey, dateText, defaultCoord, diffText, durText, loadCoords,
  offsetMin, parseCoord, saveCoords, timeText, utcText, zoned,
} from './logic'
import type { City } from './logic'

type ModeId = 'clock' | 'find'
type Toast = (m: string) => void
type SetCoord = (c: City, v: string | null) => void

const MODES: (SubTabItem<ModeId> & { hint: string })[] = [
  { id: 'clock', label: 'Đồng hồ', hint: 'Giờ hiện tại ở 6 thành phố đang theo dõi, đã tính giờ mùa hè.' },
  { id: 'find', label: 'Tìm theo giờ', hint: 'Chọn một giờ, xem nơi nào đang ở giờ đó kèm tọa độ.' },
]
const IDS = MODES.map(m => m.id)
const KEY = 'accmgr_wc_mode'
const QUICK = ['06:00', '09:00', '12:00', '14:00', '18:00', '20:00', '23:00']
const FOCUS_KEYS = new Set(FOCUS.map(cityKey))

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

// Ô coord "lat, lng": sửa rồi Enter/Lưu để ghi lại, Copy để dán vào app giả lập vị trí
function CoordField({ city, coord, setCoord, toast }: { city: City; coord: string; setCoord: SetCoord; toast: Toast }) {
  const [draft, setDraft] = useState(coord)
  const dirty = draft.trim() !== coord
  const custom = coord !== defaultCoord(city)
  const save = () => {
    const v = parseCoord(draft)
    if (!v) { toast('Coord không hợp lệ, nhập dạng lat, lng (vd. 40.7580, -73.9855)'); return }
    setCoord(city, v === defaultCoord(city) ? null : v)
    setDraft(v)
    toast(`Đã lưu coord cho ${city.name}`)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') save()
    else if (e.key === 'Escape') setDraft(coord)
  }
  return (
    <div className="wc-coord">
      <input className={'inp mono' + (custom ? ' custom' : '')} type="text" spellCheck={false} aria-label={`Coord ${city.name}`}
        value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} />
      {dirty ? (
        <>
          <button type="button" className="btn sm teal" onClick={save}>Lưu</button>
          <button type="button" className="btn sm" onClick={() => setDraft(coord)}>Hủy</button>
        </>
      ) : (
        <>
          <button type="button" className="btn sm teal" onClick={() => copyText(coord).then(() => toast(`Đã copy ${coord}`), () => toast('Không copy được'))}>Copy</button>
          {custom && <button type="button" className="btn sm ghost" title={`Về mặc định: ${defaultCoord(city)}`} onClick={() => setCoord(city, null)}>Mặc định</button>}
        </>
      )}
    </div>
  )
}

function ClockTab({ now, coordOf, setCoord, toast }: { now: Date; coordOf: (c: City) => string; setCoord: SetCoord; toast: Toast }) {
  const localOff = offsetMin(LOCAL_TZ, now)
  const local = zoned(LOCAL_TZ, now)
  return (
    <>
      <p className="wc-local">Giờ máy ({LOCAL_TZ}): <b>{timeText(local, true)}</b> <span className="dim">{dateText(local)} · {utcText(localOff)}</span></p>
      <div className="wc-grid">
        {FOCUS.map(c => {
          const z = zoned(c.tz, now)
          const off = offsetMin(c.tz, now)
          const day = z.h >= 6 && z.h < 18
          return (
            <section key={cityKey(c)} className="pane wc-card">
              <div className="pane-h">
                <h3>{c.name} <small>{c.country}</small></h3>
                <span className={'badge ' + (day ? 'tone-amber' : 'tone-teal')}>{day ? 'Ngày' : 'Đêm'}</span>
              </div>
              <div className="en-pad">
                <div className="wc-time">{timeText(z, true)}</div>
                <p className="wc-meta">{dateText(z)} · {utcText(off)} · <b>{diffText(off - localOff)}</b> so với giờ máy</p>
                <CoordField key={coordOf(c)} city={c} coord={coordOf(c)} setCoord={setCoord} toast={toast} />
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

function FindTab({ now, coordOf, setCoord, toast }: { now: Date; coordOf: (c: City) => string; setCoord: SetCoord; toast: Toast }) {
  const [target, setTarget] = useState('14:00')
  const [tol, setTol] = useState('hour') // 'hour': cùng khung giờ (14:00–14:59), số: ± phút
  const [th, tm] = target.split(':').map(Number)
  const valid = Number.isFinite(th) && Number.isFinite(tm)
  const T = th * 60 + tm
  const localOff = offsetMin(LOCAL_TZ, now)

  const rows = valid ? CITIES.map(c => {
    const z = zoned(c.tz, now)
    return { c, z, m: z.h * 60 + z.mi, off: offsetMin(c.tz, now) }
  }) : []
  const hits = rows
    .filter(r => (tol === 'hour' ? r.z.h === th : circDist(r.m, T) <= +tol))
    .sort((a, b) => circDist(a.m, T) - circDist(b.m, T) || +FOCUS_KEYS.has(cityKey(b.c)) - +FOCUS_KEYS.has(cityKey(a.c)))
  const focusRows = rows.filter(r => FOCUS_KEYS.has(cityKey(r.c)))
  const localWhen = (wait: number) => zoned(LOCAL_TZ, new Date(now.getTime() + wait * 60000))

  return (
    <>
      <div className="wc-find">
        <label className="fld">Đang là
          <input className="inp" type="time" value={target} onChange={e => setTarget(e.target.value)} />
        </label>
        <select className="inp" value={tol} onChange={e => setTol(e.target.value)} aria-label="Độ lệch cho phép">
          <option value="hour">Cùng khung giờ</option>
          <option value="15">± 15 phút</option>
          <option value="30">± 30 phút</option>
          <option value="60">± 1 giờ</option>
        </select>
        <div className="wc-quick">
          {QUICK.map(q => (
            <button key={q} type="button" className={'btn sm' + (q === target ? ' sell' : '')} onClick={() => setTarget(q)}>{q.replace(':00', 'h')}</button>
          ))}
        </div>
      </div>

      <section className="pane">
        <div className="pane-h">
          <h3>Đang là {target} <small>{hits.length} nơi</small></h3>
        </div>
        <div className="en-pad">
          {hits.length === 0 ? <p className="pane-empty">Không có thành phố nào trong danh sách đang ở giờ này. Thử nới độ lệch.</p> : (
            <table className="nt-table wc-table">
              <thead>
                <tr><th className="c-t">Thành phố</th><th className="c-h">Giờ</th><th className="c-u">Múi giờ</th><th>Coord (lat, lng)</th></tr>
              </thead>
              <tbody>
                {hits.map(r => (
                  <tr key={cityKey(r.c)} className={FOCUS_KEYS.has(cityKey(r.c)) ? 'focus' : ''}>
                    <td className="c-t" title={`${r.c.name}, ${r.c.country}`}>{r.c.name} <span className="dim">{r.c.country}</span></td>
                    <td className="c-h mono">{timeText(r.z)} <span className="dim">{r.z.wd}</span></td>
                    <td className="c-u dim">{utcText(r.off)} · {diffText(r.off - localOff)}</td>
                    <td><CoordField key={coordOf(r.c)} city={r.c} coord={coordOf(r.c)} setCoord={setCoord} toast={toast} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {valid && (
        <section className="pane wc-next">
          <div className="pane-h"><h3>Khi nào 6 thành phố chính tới {target}</h3></div>
          <div className="en-pad">
            <table className="nt-table">
              <tbody>
                {focusRows.map(r => {
                  const wait = (T - r.m + 1440) % 1440
                  return (
                    <tr key={cityKey(r.c)}>
                      <td className="c-t">{r.c.name}</td>
                      <td className="mono">bây giờ {timeText(r.z)}</td>
                      <td>{wait === 0 ? <b>Đúng lúc này</b> : <>sau <b>{durText(wait)}</b></>}</td>
                      <td className="dim">lúc {timeText(localWhen(wait))} {dateText(localWhen(wait))} giờ máy</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

export default function WorldClockTool({ toast }: { toast: Toast }) {
  const [mode, setMode] = useState<ModeId>(() => readStored(KEY, IDS, 'clock'))
  const [coords, setCoords] = useState(loadCoords)
  const now = useNow()
  const pick = (id: ModeId) => { setMode(id); writeStored(KEY, id) }

  const coordOf = useCallback((c: City) => coords[cityKey(c)] ?? defaultCoord(c), [coords])
  // v = null: bỏ coord riêng, quay về tọa độ trung tâm thành phố
  const setCoord = useCallback<SetCoord>((c, v) => {
    setCoords(m => {
      const next = { ...m }
      if (v) next[cityKey(c)] = v
      else delete next[cityKey(c)]
      saveCoords(next)
      return next
    })
  }, [])

  return (
    <>
      <PageHead title="Giờ thế giới" sub={MODES.find(m => m.id === mode)!.hint} />
      <SubTabs items={MODES} value={mode} onChange={pick} label="Chế độ giờ thế giới" />
      <Activity mode={mode === 'clock' ? 'visible' : 'hidden'}><ClockTab now={now} coordOf={coordOf} setCoord={setCoord} toast={toast} /></Activity>
      <Activity mode={mode === 'find' ? 'visible' : 'hidden'}><FindTab now={now} coordOf={coordOf} setCoord={setCoord} toast={toast} /></Activity>
    </>
  )
}

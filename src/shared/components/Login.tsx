import { useState } from 'react'
import type { FormEvent } from 'react'
import { login } from '../lib/auth'
import type { User } from '../lib/auth'

export default function Login({ onDone, onGuest }: { onDone: (u: User) => void; onGuest?: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { onDone(await login(username.trim(), password)) } catch (x) { setErr((x as Error).message); setBusy(false) }
  }

  return (
    <main className="main" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, width: 'min(340px, 100%)' }}>
        <h1 style={{ margin: 0 }}>Đăng nhập</h1>
        <input className="fld" placeholder="Tên đăng nhập" autoComplete="username" autoFocus value={username} onChange={e => setUsername(e.target.value)} />
        <input className="fld" type="password" placeholder="Mật khẩu" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        {err && <p role="alert" style={{ margin: 0, color: 'var(--red, #c0392b)' }}>{err}</p>}
        <button className="btn solid" type="submit" disabled={busy || !username || !password}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        {onGuest && (
          <button className="btn ghost" type="button" onClick={onGuest} disabled={busy}>Dùng không cần đăng nhập</button>
        )}
      </form>
    </main>
  )
}

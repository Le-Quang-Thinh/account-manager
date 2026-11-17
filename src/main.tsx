import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import Login from './shared/components/Login'
import { getMe, isGuest, logout, setGuest } from './shared/lib/auth'
import type { User } from './shared/lib/auth'
import { initStore } from './tools/accounts/store'

// Trạng thái phiên: chưa biết | chưa đăng nhập (null) | đã đăng nhập | không có server ('offline') | khách ('guest')
type Session = User | null | 'offline' | 'guest' | undefined

// Chưa đăng nhập -> form đăng nhập (kèm nút dùng thử không đăng nhập);
// đăng nhập/chọn khách xong mới nạp store rồi vẽ giao diện.
function Root() {
  const [user, setUser] = useState<Session>(undefined)
  const [ready, setReady] = useState(false)

  // Server báo chưa đăng nhập nhưng người dùng đã từng chọn chế độ khách -> vào thẳng chế độ khách
  useEffect(() => { getMe().then(u => setUser(u === null && isGuest() ? 'guest' : u)) }, [])
  const guest = user === 'guest'
  const userKey = user === 'offline' ? 'offline' : guest ? 'guest' : user ? String(user.id) : ''
  useEffect(() => {
    if (user === undefined || user === null) return
    initStore(userKey) // hiện ngay bản localStorage, server đồng bộ sau
    setReady(true)
  }, [user, userKey])

  if (user === undefined) return null
  if (user === null) return <Login onDone={setUser} onGuest={() => { setGuest(true); setUser('guest') }} />
  if (!ready) return null
  // Khách: nút "Đăng nhập" (bỏ chế độ khách, tải lại về form). Đăng nhập thật: "Đăng xuất". Offline: không có.
  const out = guest
    ? () => { setGuest(false); location.reload() }
    : user === 'offline' ? undefined : async () => { await logout(); location.reload() }
  return <App userKey={userKey} guest={guest} username={guest || user === 'offline' ? undefined : user.username} onLogout={out} />
}

createRoot(document.getElementById('root')!).render(<Root />)

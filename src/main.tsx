import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'
import Login from './shared/components/Login'
import { getMe, logout } from './shared/lib/auth'
import type { User } from './shared/lib/auth'
import { initStore } from './tools/accounts/store'

// Chưa đăng nhập -> form đăng nhập; đăng nhập xong mới nạp store của user đó rồi vẽ giao diện
function Root() {
  const [user, setUser] = useState<User | null | 'offline' | undefined>(undefined)
  const [ready, setReady] = useState(false)

  useEffect(() => { getMe().then(setUser) }, [])
  useEffect(() => {
    if (user === undefined || user === null) return
    initStore().finally(() => setReady(true))
  }, [user])

  if (user === undefined) return null
  if (user === null) return <Login onDone={setUser} />
  if (!ready) return null
  const out = user === 'offline' ? undefined : async () => { await logout(); location.reload() }
  return <App username={user === 'offline' ? undefined : user.username} onLogout={out} />
}

createRoot(document.getElementById('root')!).render(<Root />)

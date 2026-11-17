export interface User { id: number; username: string; isAdmin: boolean }

const API = './api'
const JSON_HDR = { 'Content-Type': 'application/json' }

// null nếu chưa đăng nhập; 'offline' nếu không có server (vd. mở bản build tĩnh)
export async function getMe(): Promise<User | null | 'offline'> {
  try {
    const r = await fetch(API + '/me', { cache: 'no-store' })
    if (r.status === 401) return null
    if (!r.ok) return 'offline'
    return await r.json()
  } catch (e) { return 'offline' }
}

export async function login(username: string, password: string): Promise<User> {
  const r = await fetch(API + '/login', { method: 'POST', headers: JSON_HDR, body: JSON.stringify({ username, password }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Đăng nhập thất bại')
  return j
}

export async function logout() {
  try { await fetch(API + '/logout', { method: 'POST' }) } catch (e) { /* bỏ qua */ }
}

// Chế độ khách: dùng app mà không đăng nhập (không có 2 tab cần server: Account & 27 thẻ).
// Lưu lựa chọn vào localStorage để lần mở sau vẫn vào thẳng, khỏi bấm lại.
const GUEST_KEY = 'accmgr_guest'
export function isGuest(): boolean {
  try { return localStorage.getItem(GUEST_KEY) === '1' } catch (e) { return false }
}
export function setGuest(on: boolean) {
  try { if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY) } catch (e) { /* bỏ qua */ }
}

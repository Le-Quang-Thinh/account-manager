// Đăng nhập: mật khẩu băm scrypt, phiên là cookie HttpOnly (DB chỉ lưu hash của token).
// Không có đăng ký công khai: admin tạo user bằng `node server/users.cjs add <user> <pass>` hoặc bot Telegram.
const crypto = require('crypto')
const { query, one } = require('./db.cjs')
const { lockedFor, noteFail, clearFails } = require('./throttle.cjs')

const COOKIE = 'sid'
const SESSION_MS = 30 * 24 * 3600 * 1000

function hashPassword(pw) {
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored).split('$')
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64)
  const want = Buffer.from(keyHex, 'hex')
  return key.length === want.length && crypto.timingSafeEqual(key, want)
}
const DUMMY = hashPassword('dummy-password') // so khớp giả khi user không tồn tại, tránh lộ user nào có thật qua thời gian phản hồi
const sha = t => crypto.createHash('sha256').update(t).digest('hex')

function parseCookies(req) {
  const out = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
const isHttps = req => !!(req.socket && req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https'
function cookieHeader(req, value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}` + (isHttps(req) ? '; Secure' : '')
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  await query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()])
  await query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [sha(token), userId, Date.now() + SESSION_MS])
  return token
}

// Trả về { id, username, isAdmin } nếu request có phiên hợp lệ, ngược lại null
async function currentUser(req) {
  const token = parseCookies(req)[COOKIE]
  if (!token) return null
  const row = await one(`SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > $2`, [sha(token), Date.now()])
  return row ? { id: row.id, username: row.username, isAdmin: row.is_admin } : null
}

// Khoá theo cặp IP + tên đăng nhập. Trên Vercel IP thật nằm ở x-forwarded-for (do Vercel đặt).
function failKey(req, username) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || ''
  return 'login|' + ip + '|' + username.toLowerCase()
}

function sendJson(res, status, obj, headers) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(obj))
}

// Đọc body JSON. Trên Vercel body đã được parse sẵn ở req.body; ở dev (Vite) thì đọc từ stream.
function readJson(req, limit = 64 * 1024) {
  // bắt buộc application/json: trình duyệt không cho site khác gửi kiểu này mà không qua preflight (chặn CSRF)
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return Promise.reject(new Error('Content-Type phải là application/json'))
  if (req.body !== undefined && req.body !== null) {
    try {
      const b = req.body
      return Promise.resolve(Buffer.isBuffer(b) ? JSON.parse(b.toString('utf8')) : typeof b === 'string' ? JSON.parse(b) : b)
    } catch (e) { return Promise.reject(new Error('JSON không hợp lệ')) }
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', c => { size += c.length; if (size > limit) reject(new Error('Dữ liệu quá lớn')); else chunks.push(c) })
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { reject(new Error('JSON không hợp lệ')) } })
    req.on('error', reject)
  })
}

async function login(req, res) {
  let body
  try { body = await readJson(req) } catch (e) { return sendJson(res, 400, { error: e.message }) }
  const username = String(body && body.username || '').trim()
  const password = String(body && body.password || '')
  if (!username || !password) return sendJson(res, 400, { error: 'Nhập tên đăng nhập và mật khẩu' })
  const key = failKey(req, username)
  const wait = await lockedFor(key)
  if (wait) return sendJson(res, 429, { error: `Sai quá nhiều lần, thử lại sau ${Math.ceil(wait / 60)} phút` })
  const u = await one('SELECT id, username, pass_hash, is_admin FROM users WHERE lower(username) = lower($1)', [username])
  const ok = verifyPassword(password, u ? u.pass_hash : DUMMY) && !!u
  if (!ok) { await noteFail(key); return sendJson(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' }) }
  await clearFails(key)
  const token = await createSession(u.id)
  sendJson(res, 200, { id: u.id, username: u.username, isAdmin: u.is_admin }, { 'Set-Cookie': cookieHeader(req, token, SESSION_MS / 1000) })
}

async function logout(req, res) {
  const token = parseCookies(req)[COOKIE]
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)])
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) })
}

module.exports = { hashPassword, verifyPassword, currentUser, login, logout, sendJson, readJson }

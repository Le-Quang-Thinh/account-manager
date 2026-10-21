// Đăng nhập: mật khẩu băm scrypt, phiên là cookie HttpOnly (DB chỉ lưu hash của token).
// Không có đăng ký công khai: admin tạo user bằng `node server/users.cjs add <user> <pass>`.
const crypto = require('crypto')
const { db } = require('./db.cjs')

const COOKIE = 'sid'
const SESSION_MS = 30 * 24 * 3600 * 1000
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

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
const isHttps = req => !!req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'
function cookieHeader(req, value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}` + (isHttps(req) ? '; Secure' : '')
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now() + SESSION_MS)
  return token
}

// Trả về { id, username, isAdmin } nếu request có phiên hợp lệ, ngược lại null
function currentUser(req) {
  const token = parseCookies(req)[COOKIE]
  if (!token) return null
  const row = db.prepare(`SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sha(token), Date.now())
  return row ? { id: row.id, username: row.username, isAdmin: !!row.is_admin } : null
}

// Chống dò mật khẩu: khoá tạm theo cặp IP + tên đăng nhập
const fails = new Map()
function failKey(req, username) { return (req.socket.remoteAddress || '') + '|' + username.toLowerCase() }
function lockedFor(key) {
  const f = fails.get(key)
  return f && f.n >= MAX_FAILS && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0
}
function noteFail(key) {
  const f = fails.get(key)
  const n = f && f.until > Date.now() ? f.n + 1 : 1
  fails.set(key, { n, until: Date.now() + LOCK_MS })
}

function sendJson(res, status, obj, headers) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(obj))
}

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    // bắt buộc application/json: trình duyệt không cho site khác gửi kiểu này mà không qua preflight (chặn CSRF)
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject(new Error('Content-Type phải là application/json'))
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
  const wait = lockedFor(key)
  if (wait) return sendJson(res, 429, { error: `Sai quá nhiều lần, thử lại sau ${Math.ceil(wait / 60)} phút` })
  const u = db.prepare('SELECT id, username, pass_hash, is_admin FROM users WHERE username = ?').get(username)
  const ok = verifyPassword(password, u ? u.pass_hash : DUMMY) && !!u
  if (!ok) { noteFail(key); return sendJson(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu' }) }
  fails.delete(key)
  const token = createSession(u.id)
  sendJson(res, 200, { id: u.id, username: u.username, isAdmin: !!u.is_admin }, { 'Set-Cookie': cookieHeader(req, token, SESSION_MS / 1000) })
}

function logout(req, res) {
  const token = parseCookies(req)[COOKIE]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) })
}

module.exports = { hashPassword, verifyPassword, currentUser, login, logout, sendJson, readJson }

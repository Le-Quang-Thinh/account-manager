// Router /api/*: đăng nhập + lưu dữ liệu theo từng user vào SQLite. Dùng chung cho `vite` (dev) và `server.cjs` (production).
//   POST /api/login   { username, password }
//   POST /api/logout
//   GET  /api/me      -> user hiện tại (401 nếu chưa đăng nhập)
//   GET  /api/store   -> store của user đang đăng nhập (null nếu còn trống)
//   PUT  /api/store   -> ghi đè store của user đang đăng nhập
const { db, tx, FILE } = require('./db.cjs')
const { currentUser, login, logout, sendJson } = require('./auth.cjs')

const MAX_BYTES = 64 * 1024 * 1024

const insAccount = db.prepare(`INSERT INTO accounts (user_id, id, raw, user, batch, status, in_list, note, sale, sold_at, prev, added_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

function writeStore(userId, j) {
  tx(() => {
    db.prepare('DELETE FROM accounts WHERE user_id = ?').run(userId)
    for (const a of j.accounts) {
      insAccount.run(userId, a.id, String(a.raw ?? ''), String(a.user ?? ''), a.batch | 0, String(a.status || 'farm'),
        a.inList === false ? 0 : 1, String(a.note ?? ''), String(a.sale ?? ''), a.soldAt ?? null,
        String(a.prev || 'special'), a.addedAt || 0)
    }
    const { accounts, ...rest } = j
    db.prepare('INSERT OR REPLACE INTO user_meta (user_id, value) VALUES (?, ?)').run(userId, JSON.stringify(rest))
  })
}

function readStore(userId) {
  const row = db.prepare('SELECT value FROM user_meta WHERE user_id = ?').get(userId)
  if (!row) return null
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id').all(userId).map(r => ({
    id: r.id, raw: r.raw, user: r.user, batch: r.batch, status: r.status, inList: !!r.in_list,
    note: r.note, sale: r.sale, soldAt: r.sold_at, prev: r.prev, addedAt: r.added_at,
  }))
  return { ...JSON.parse(row.value), accounts }
}

function store(req, res, user) {
  if (req.method === 'GET') {
    try { sendJson(res, 200, readStore(user.id)) } catch (e) { sendJson(res, 500, { error: 'Không đọc được dữ liệu: ' + e.message }) }
    return
  }
  if (req.method === 'PUT') {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'Content-Type phải là application/json' })
    const chunks = []
    let size = 0
    let tooBig = false
    req.on('data', c => {
      size += c.length
      if (size > MAX_BYTES) tooBig = true
      else chunks.push(c)
    })
    req.on('end', () => {
      if (tooBig) return sendJson(res, 413, { error: 'Dữ liệu quá lớn' })
      try {
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!j || !Array.isArray(j.accounts)) return sendJson(res, 400, { error: 'Dữ liệu không hợp lệ' })
        writeStore(user.id, j)
        sendJson(res, 200, { ok: true, accounts: j.accounts.length })
      } catch (e) {
        sendJson(res, 400, { error: 'Không ghi được: ' + e.message })
      }
    })
    return
  }
  res.writeHead(405, { Allow: 'GET, PUT' })
  res.end()
}

function api(req, res) {
  const p = (req.originalUrl || req.url || '').split('?')[0].replace(/^\/api/, '')
  if (p === '/login' && req.method === 'POST') return login(req, res)
  if (p === '/logout' && req.method === 'POST') return logout(req, res)
  const user = currentUser(req)
  if (!user) return sendJson(res, 401, { error: 'Chưa đăng nhập' })
  if (p === '/me' && req.method === 'GET') return sendJson(res, 200, user)
  if (p === '/store') return store(req, res, user)
  sendJson(res, 404, { error: 'Không tìm thấy' })
}

module.exports = { api, readStore, writeStore, FILE }

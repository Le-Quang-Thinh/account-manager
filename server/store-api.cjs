// Router /api/*: đăng nhập + lưu dữ liệu theo từng user vào SQLite. Dùng chung cho `vite` (dev) và `server.cjs` (production).
//   POST /api/login   { username, password }
//   POST /api/logout
//   GET  /api/me      -> user hiện tại (401 nếu chưa đăng nhập)
//   GET  /api/store   -> store của user đang đăng nhập (null nếu còn trống)
//   PUT  /api/store   -> ghi đè store của user đang đăng nhập
//   GET  /api/greenraid  -> {rev, batches, history} của tool Green Raid (null nếu còn trống)
//   PUT  /api/greenraid  -> {baseRev, batches, history}; 409 nếu baseRev khác rev trên server
const { randomUUID } = require('crypto')
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

// ----- Quản lý Green Raid -----
class RevConflict extends Error {}

function readGreenraid(userId) {
  const meta = db.prepare('SELECT rev FROM greenraid_meta WHERE user_id = ?').get(userId)
  if (!meta) return null
  const byBatch = new Map()
  for (const r of db.prepare('SELECT * FROM greenraid_accounts WHERE user_id = ? ORDER BY batch_id, pos').all(userId)) {
    const a = { id: r.id, text: r.text, checked: !!r.checked, failLabel: r.fail_label, special: !!r.special, exported: !!r.exported, exportBatchId: r.export_batch_id }
    const l = byBatch.get(r.batch_id)
    if (l) l.push(a); else byBatch.set(r.batch_id, [a])
  }
  const batches = db.prepare('SELECT * FROM greenraid_batches WHERE user_id = ? ORDER BY pos').all(userId)
    .map(b => ({ id: b.id, name: b.name, fileName: b.file_name, accounts: byBatch.get(b.id) || [] }))
  const history = db.prepare('SELECT * FROM greenraid_history WHERE user_id = ? ORDER BY pos').all(userId)
    .map(h => ({ id: h.id, name: h.name, count: h.count, createdAt: h.created_at }))
  return { rev: meta.rev, batches, history }
}

// Ghi đè toàn bộ; từ chối (RevConflict) nếu baseRev không khớp rev hiện tại trên server
function writeGreenraid(userId, j) {
  return tx(() => {
    const cur = db.prepare('SELECT rev FROM greenraid_meta WHERE user_id = ?').get(userId)?.rev ?? 0
    if ((j.baseRev | 0) !== cur) throw new RevConflict(String(cur))
    db.prepare('DELETE FROM greenraid_accounts WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM greenraid_batches WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM greenraid_history WHERE user_id = ?').run(userId)
    const insB = db.prepare('INSERT INTO greenraid_batches (user_id, id, pos, name, file_name) VALUES (?, ?, ?, ?, ?)')
    const insA = db.prepare(`INSERT INTO greenraid_accounts (user_id, id, batch_id, pos, text, checked, fail_label, special, exported, export_batch_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    const insH = db.prepare('INSERT INTO greenraid_history (user_id, id, pos, name, count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    j.batches.forEach((b, bi) => {
      insB.run(userId, String(b.id), bi, String(b.name ?? ''), String(b.fileName ?? ''))
      ;(Array.isArray(b.accounts) ? b.accounts : []).forEach((a, ai) => {
        insA.run(userId, String(a.id), String(b.id), ai, String(a.text ?? ''), a.checked ? 1 : 0, String(a.failLabel || ''),
          a.special ? 1 : 0, a.exported ? 1 : 0, String(a.exportBatchId || ''))
      })
    })
    j.history.forEach((h, i) => insH.run(userId, String(h.id), i, String(h.name ?? ''), h.count | 0, Number(h.createdAt) || 0))
    const rev = cur + 1
    db.prepare('INSERT OR REPLACE INTO greenraid_meta (user_id, rev, updated_at) VALUES (?, ?, ?)').run(userId, rev, Date.now())
    return rev
  })
}

// Thêm 1 batch vào cuối (dùng cho bot Telegram). Tăng rev nên tab web đang mở sẽ biết có thay đổi.
function addGreenraidBatch(userId, fileName, lines) {
  return tx(() => {
    const cur = db.prepare('SELECT rev FROM greenraid_meta WHERE user_id = ?').get(userId)?.rev ?? 0
    const pos = db.prepare('SELECT COALESCE(MAX(pos) + 1, 0) AS p FROM greenraid_batches WHERE user_id = ?').get(userId).p
    const id = randomUUID()
    db.prepare('INSERT INTO greenraid_batches (user_id, id, pos, name, file_name) VALUES (?, ?, ?, ?, ?)')
      .run(userId, id, pos, fileName.replace(/\.txt$/i, ''), fileName)
    const ins = db.prepare('INSERT INTO greenraid_accounts (user_id, id, batch_id, pos, text) VALUES (?, ?, ?, ?, ?)')
    lines.forEach((text, i) => ins.run(userId, randomUUID(), id, i, text))
    db.prepare('INSERT OR REPLACE INTO greenraid_meta (user_id, rev, updated_at) VALUES (?, ?, ?)').run(userId, cur + 1, Date.now())
    return { batchCount: db.prepare('SELECT COUNT(*) AS n FROM greenraid_batches WHERE user_id = ?').get(userId).n }
  })
}

function greenraid(req, res, user) {
  if (req.method === 'GET') {
    try { sendJson(res, 200, readGreenraid(user.id)) } catch (e) { sendJson(res, 500, { error: 'Không đọc được dữ liệu: ' + e.message }) }
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
        if (!j || !Array.isArray(j.batches) || !Array.isArray(j.history)) return sendJson(res, 400, { error: 'Dữ liệu không hợp lệ' })
        const rev = writeGreenraid(user.id, j)
        sendJson(res, 200, { ok: true, rev })
      } catch (e) {
        if (e instanceof RevConflict) return sendJson(res, 409, { error: 'Dữ liệu đã được sửa ở nơi khác', rev: +e.message })
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
  if (p === '/greenraid') return greenraid(req, res, user)
  sendJson(res, 404, { error: 'Không tìm thấy' })
}

module.exports = { api, readStore, writeStore, readGreenraid, writeGreenraid, addGreenraidBatch, FILE }

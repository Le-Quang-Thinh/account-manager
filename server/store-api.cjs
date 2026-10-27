// Router /api/*: đăng nhập + lưu dữ liệu theo từng user vào Postgres (Supabase). Dùng chung cho `vite` (dev) và Vercel (api/).
//   POST /api/login   { username, password }
//   POST /api/logout
//   GET  /api/me      -> user hiện tại (401 nếu chưa đăng nhập)
//   GET  /api/store   -> store của user đang đăng nhập (null nếu còn trống)
//   PUT  /api/store   -> ghi đè store của user đang đăng nhập
//   GET  /api/greenraid  -> {rev, batches, history} của tool Green Raid (null nếu còn trống)
//   PUT  /api/greenraid  -> {baseRev, batches, history}; 409 nếu baseRev khác rev trên server
//   GET  /api/eventnotes -> {rev, events} của tab Note event (null nếu còn trống)
//   PUT  /api/eventnotes -> {baseRev, events}; 409 nếu baseRev khác rev trên server
const { randomUUID } = require('crypto')
const { query, rows, one, tx } = require('./db.cjs')
const { currentUser, login, logout, sendJson, readJson } = require('./auth.cjs')

// Vercel giới hạn body của function ~4.5MB, nên đây chỉ là chặn trên cho chạy local
const MAX_BYTES = 64 * 1024 * 1024

const lockUser = (c, userId) => c.query('SELECT pg_advisory_xact_lock($1)', [userId]) // tuần tự hoá ghi của cùng 1 user

async function writeStore(userId, j) {
  const { accounts, ...rest } = j
  await tx(async c => {
    await lockUser(c, userId)
    // Chỉ ghi phần thay đổi (upsert, bỏ qua dòng giống hệt) rồi xoá dòng không còn: tránh xoá và ghi lại toàn bộ mỗi lần lưu
    const json = JSON.stringify(accounts)
    await c.query(`INSERT INTO accounts (user_id, id, raw, acc_user, batch, status, in_list, note, sale, sold_at, prev, added_at)
      SELECT $1, a.id, COALESCE(a.raw, ''), COALESCE(a."user", ''), COALESCE(a.batch, 0), COALESCE(NULLIF(a.status, ''), 'farm'),
        COALESCE(a."inList", true), COALESCE(a.note, ''), COALESCE(a.sale, ''), a."soldAt", COALESCE(NULLIF(a.prev, ''), 'special'), COALESCE(a."addedAt", 0)
      FROM jsonb_to_recordset($2::jsonb) AS a(id bigint, raw text, "user" text, batch int, status text, "inList" boolean,
        note text, sale text, "soldAt" bigint, prev text, "addedAt" bigint)
      ON CONFLICT (user_id, id) DO UPDATE SET raw = EXCLUDED.raw, acc_user = EXCLUDED.acc_user, batch = EXCLUDED.batch,
        status = EXCLUDED.status, in_list = EXCLUDED.in_list, note = EXCLUDED.note, sale = EXCLUDED.sale,
        sold_at = EXCLUDED.sold_at, prev = EXCLUDED.prev, added_at = EXCLUDED.added_at
      WHERE (accounts.raw, accounts.acc_user, accounts.batch, accounts.status, accounts.in_list, accounts.note, accounts.sale, accounts.sold_at, accounts.prev, accounts.added_at)
        IS DISTINCT FROM (EXCLUDED.raw, EXCLUDED.acc_user, EXCLUDED.batch, EXCLUDED.status, EXCLUDED.in_list, EXCLUDED.note, EXCLUDED.sale, EXCLUDED.sold_at, EXCLUDED.prev, EXCLUDED.added_at)`, [userId, json])
    await c.query(`DELETE FROM accounts a WHERE a.user_id = $1
      AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(id bigint) WHERE x.id = a.id)`, [userId, json])
    await c.query(`INSERT INTO user_meta (user_id, value) VALUES ($1, $2)
      ON CONFLICT (user_id) DO UPDATE SET value = EXCLUDED.value`, [userId, JSON.stringify(rest)])
  })
}

async function readStore(userId) {
  const [row, list] = await Promise.all([
    one('SELECT value FROM user_meta WHERE user_id = $1', [userId]),
    rows(`SELECT id, raw, acc_user, batch, status, in_list, note, sale, sold_at, prev, added_at
      FROM accounts WHERE user_id = $1 ORDER BY id`, [userId]),
  ])
  if (!row) return null
  const accounts = list.map(r => ({
    id: r.id, raw: r.raw, user: r.acc_user, batch: r.batch, status: r.status, inList: r.in_list,
    note: r.note, sale: r.sale, soldAt: r.sold_at, prev: r.prev, addedAt: r.added_at,
  }))
  return { ...JSON.parse(row.value), accounts }
}

async function store(req, res, user) {
  if (req.method === 'GET') return sendJson(res, 200, await readStore(user.id))
  if (req.method === 'PUT') {
    let j
    try { j = await readJson(req, MAX_BYTES) } catch (e) { return sendJson(res, /Content-Type/.test(e.message) ? 415 : /lớn/.test(e.message) ? 413 : 400, { error: e.message }) }
    if (!j || !Array.isArray(j.accounts)) return sendJson(res, 400, { error: 'Dữ liệu không hợp lệ' })
    try {
      await writeStore(user.id, j)
    } catch (e) {
      return sendJson(res, 400, { error: 'Không ghi được: ' + e.message })
    }
    return sendJson(res, 200, { ok: true, accounts: j.accounts.length })
  }
  res.writeHead(405, { Allow: 'GET, PUT' })
  res.end()
}

// ----- Quản lý Green Raid -----
class RevConflict extends Error {}

async function readGreenraid(userId) {
  const meta = await one('SELECT rev FROM greenraid_meta WHERE user_id = $1', [userId])
  if (!meta) return null
  const byBatch = new Map()
  for (const r of await rows('SELECT * FROM greenraid_accounts WHERE user_id = $1 ORDER BY batch_id, pos', [userId])) {
    const a = { id: r.id, text: r.text, checked: r.checked, failLabel: r.fail_label, special: r.special, exported: r.exported, exportBatchId: r.export_batch_id }
    const l = byBatch.get(r.batch_id)
    if (l) l.push(a); else byBatch.set(r.batch_id, [a])
  }
  const batches = (await rows('SELECT * FROM greenraid_batches WHERE user_id = $1 ORDER BY pos', [userId]))
    .map(b => ({ id: b.id, name: b.name, fileName: b.file_name, accounts: byBatch.get(b.id) || [] }))
  const history = (await rows('SELECT * FROM greenraid_history WHERE user_id = $1 ORDER BY pos', [userId]))
    .map(h => ({ id: h.id, name: h.name, count: h.count, createdAt: h.created_at }))
  return { rev: meta.rev, batches, history }
}

// Ghi đè toàn bộ; từ chối (RevConflict) nếu baseRev không khớp rev hiện tại trên server
function writeGreenraid(userId, j) {
  const batches = [], accounts = []
  j.batches.forEach((b, bi) => {
    batches.push({ id: String(b.id), pos: bi, name: String(b.name ?? ''), file_name: String(b.fileName ?? '') })
    ;(Array.isArray(b.accounts) ? b.accounts : []).forEach((a, ai) => accounts.push({
      id: String(a.id), batch_id: String(b.id), pos: ai, text: String(a.text ?? ''), checked: !!a.checked, fail_label: String(a.failLabel || ''),
      special: !!a.special, exported: !!a.exported, export_batch_id: String(a.exportBatchId || ''),
    }))
  })
  const history = j.history.map((h, i) => ({ id: String(h.id), pos: i, name: String(h.name ?? ''), count: h.count | 0, created_at: Number(h.createdAt) || 0 }))
  return tx(async c => {
    await lockUser(c, userId)
    const cur = (await c.query('SELECT rev FROM greenraid_meta WHERE user_id = $1', [userId])).rows[0]?.rev ?? 0
    if ((j.baseRev | 0) !== cur) throw new RevConflict(String(cur))
    await c.query('DELETE FROM greenraid_accounts WHERE user_id = $1', [userId])
    await c.query('DELETE FROM greenraid_batches WHERE user_id = $1', [userId])
    await c.query('DELETE FROM greenraid_history WHERE user_id = $1', [userId])
    await c.query(`INSERT INTO greenraid_batches (user_id, id, pos, name, file_name)
      SELECT $1, b.id, b.pos, b.name, b.file_name FROM jsonb_to_recordset($2::jsonb) AS b(id text, pos int, name text, file_name text)`,
    [userId, JSON.stringify(batches)])
    await c.query(`INSERT INTO greenraid_accounts (user_id, id, batch_id, pos, text, checked, fail_label, special, exported, export_batch_id)
      SELECT $1, a.id, a.batch_id, a.pos, a.text, a.checked, a.fail_label, a.special, a.exported, a.export_batch_id
      FROM jsonb_to_recordset($2::jsonb) AS a(id text, batch_id text, pos int, text text, checked boolean, fail_label text,
        special boolean, exported boolean, export_batch_id text)`, [userId, JSON.stringify(accounts)])
    await c.query(`INSERT INTO greenraid_history (user_id, id, pos, name, count, created_at)
      SELECT $1, h.id, h.pos, h.name, h.count, h.created_at FROM jsonb_to_recordset($2::jsonb) AS h(id text, pos int, name text, count int, created_at bigint)`,
    [userId, JSON.stringify(history)])
    const rev = cur + 1
    await c.query(`INSERT INTO greenraid_meta (user_id, rev, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET rev = EXCLUDED.rev, updated_at = EXCLUDED.updated_at`, [userId, rev, Date.now()])
    return rev
  })
}

// Thêm 1 batch vào cuối (dùng cho bot Telegram). Tăng rev nên tab web đang mở sẽ biết có thay đổi.
function addGreenraidBatch(userId, fileName, lines) {
  return tx(async c => {
    await lockUser(c, userId)
    const cur = (await c.query('SELECT rev FROM greenraid_meta WHERE user_id = $1', [userId])).rows[0]?.rev ?? 0
    const pos = (await c.query('SELECT COALESCE(MAX(pos) + 1, 0) AS p FROM greenraid_batches WHERE user_id = $1', [userId])).rows[0].p
    const id = randomUUID()
    await c.query('INSERT INTO greenraid_batches (user_id, id, pos, name, file_name) VALUES ($1, $2, $3, $4, $5)',
      [userId, id, pos, fileName.replace(/\.txt$/i, ''), fileName])
    await c.query(`INSERT INTO greenraid_accounts (user_id, id, batch_id, pos, text)
      SELECT $1, gen_random_uuid()::text, $2, t.ord - 1, t.text FROM unnest($3::text[]) WITH ORDINALITY AS t(text, ord)`, [userId, id, lines])
    await c.query(`INSERT INTO greenraid_meta (user_id, rev, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET rev = EXCLUDED.rev, updated_at = EXCLUDED.updated_at`, [userId, cur + 1, Date.now()])
    const batchCount = (await c.query('SELECT COUNT(*) AS n FROM greenraid_batches WHERE user_id = $1', [userId])).rows[0].n
    return { batchCount }
  })
}

async function greenraid(req, res, user) {
  if (req.method === 'GET') return sendJson(res, 200, await readGreenraid(user.id))
  if (req.method === 'PUT') {
    let j
    try { j = await readJson(req, MAX_BYTES) } catch (e) { return sendJson(res, /Content-Type/.test(e.message) ? 415 : /lớn/.test(e.message) ? 413 : 400, { error: e.message }) }
    if (!j || !Array.isArray(j.batches) || !Array.isArray(j.history)) return sendJson(res, 400, { error: 'Dữ liệu không hợp lệ' })
    try {
      const rev = await writeGreenraid(user.id, j)
      return sendJson(res, 200, { ok: true, rev })
    } catch (e) {
      if (e instanceof RevConflict) return sendJson(res, 409, { error: 'Dữ liệu đã được sửa ở nơi khác', rev: +e.message })
      return sendJson(res, 400, { error: 'Không ghi được: ' + e.message })
    }
  }
  res.writeHead(405, { Allow: 'GET, PUT' })
  res.end()
}

// ----- Note event: cả danh sách event của user là 1 JSON, rev tăng mỗi lần ghi -----
const EVENT_NOTES_DDL = `CREATE TABLE IF NOT EXISTS event_notes (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rev bigint NOT NULL,
  value text NOT NULL,
  updated_at bigint NOT NULL
); ALTER TABLE event_notes ENABLE ROW LEVEL SECURITY`
let eventNotesReady // tự tạo bảng lần đầu để không phải chạy lại schema.sql thủ công
const ensureEventNotes = () => eventNotesReady ??= query(EVENT_NOTES_DDL).catch(e => { eventNotesReady = undefined; throw e })

async function readEventNotes(userId) {
  await ensureEventNotes()
  const r = await one('SELECT rev, value FROM event_notes WHERE user_id = $1', [userId])
  return r ? { rev: r.rev, events: JSON.parse(r.value) } : null
}

function writeEventNotes(userId, j) {
  return tx(async c => {
    await lockUser(c, userId)
    const cur = (await c.query('SELECT rev FROM event_notes WHERE user_id = $1', [userId])).rows[0]?.rev ?? 0
    if ((j.baseRev | 0) !== cur) throw new RevConflict(String(cur))
    const rev = cur + 1
    await c.query(`INSERT INTO event_notes (user_id, rev, value, updated_at) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET rev = EXCLUDED.rev, value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [userId, rev, JSON.stringify(j.events), Date.now()])
    return rev
  })
}

async function eventNotes(req, res, user) {
  if (req.method === 'GET') return sendJson(res, 200, await readEventNotes(user.id))
  if (req.method === 'PUT') {
    let j
    try { j = await readJson(req, MAX_BYTES) } catch (e) { return sendJson(res, /Content-Type/.test(e.message) ? 415 : /lớn/.test(e.message) ? 413 : 400, { error: e.message }) }
    if (!j || !Array.isArray(j.events)) return sendJson(res, 400, { error: 'Dữ liệu không hợp lệ' })
    try {
      await ensureEventNotes()
      return sendJson(res, 200, { ok: true, rev: await writeEventNotes(user.id, j) })
    } catch (e) {
      if (e instanceof RevConflict) return sendJson(res, 409, { error: 'Dữ liệu đã được sửa ở nơi khác', rev: +e.message })
      return sendJson(res, 400, { error: 'Không ghi được: ' + e.message })
    }
  }
  res.writeHead(405, { Allow: 'GET, PUT' })
  res.end()
}

async function route(req, res) {
  const p = (req.originalUrl || req.url || '').split('?')[0].replace(/^\/api/, '')
  if (p === '/login' && req.method === 'POST') return login(req, res)
  if (p === '/logout' && req.method === 'POST') return logout(req, res)
  const user = await currentUser(req)
  if (!user) return sendJson(res, 401, { error: 'Chưa đăng nhập' })
  if (p === '/me' && req.method === 'GET') return sendJson(res, 200, user)
  if (p === '/store') return store(req, res, user)
  if (p === '/greenraid') return greenraid(req, res, user)
  if (p === '/eventnotes') return eventNotes(req, res, user)
  sendJson(res, 404, { error: 'Không tìm thấy' })
}

async function api(req, res) {
  try {
    await route(req, res)
  } catch (e) {
    console.error('API loi:', e)
    if (!res.headersSent) sendJson(res, 500, { error: 'Lỗi máy chủ' })
    else res.end()
  }
}

module.exports = { api, readStore, writeStore, readGreenraid, writeGreenraid, addGreenraidBatch }

// Khoá tạm khi đoán sai nhiều lần (đăng nhập, /link của bot). Lưu ở DB vì serverless không giữ bộ nhớ giữa các lần gọi.
const { query, one } = require('./db.cjs')

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

// Số giây còn bị khoá (0 nếu không bị khoá)
async function lockedFor(key) {
  const f = await one('SELECT n, locked_until FROM login_fails WHERE key = $1', [key])
  return f && f.n >= MAX_FAILS && f.locked_until > Date.now() ? Math.ceil((f.locked_until - Date.now()) / 1000) : 0
}

async function noteFail(key) {
  const now = Date.now()
  await query(`INSERT INTO login_fails (key, n, locked_until) VALUES ($1, 1, $2)
    ON CONFLICT (key) DO UPDATE SET n = CASE WHEN login_fails.locked_until > $3 THEN login_fails.n + 1 ELSE 1 END, locked_until = $2`,
  [key, now + LOCK_MS, now])
  await query('DELETE FROM login_fails WHERE locked_until < $1', [now])
}

const clearFails = key => query('DELETE FROM login_fails WHERE key = $1', [key])

module.exports = { lockedFor, noteFail, clearFails }

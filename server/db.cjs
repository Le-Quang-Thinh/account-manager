// Postgres (Supabase) dùng chung cho API và bot. Cần biến môi trường DATABASE_URL (chuỗi kết nối Supabase,
// nên dùng "Transaction pooler" cổng 6543 vì chạy serverless). Schema nằm ở supabase/schema.sql.
const path = require('path')
try { process.loadEnvFile(path.join(__dirname, '..', '.env')) } catch (e) { /* không có .env (vd. trên Vercel) */ }
const { Pool, types } = require('pg')

types.setTypeParser(20, v => Number(v)) // bigint -> number (timestamp ms, id, đếm đều nhỏ hơn 2^53)

let pool
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('Chưa đặt DATABASE_URL (chuỗi kết nối Supabase)')
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
    pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000 })
    pool.on('error', e => console.error('Postgres:', e.message))
  }
  return pool
}

const query = (text, params) => getPool().query(text, params)
const rows = async (text, params) => (await query(text, params)).rows
const one = async (text, params) => (await query(text, params)).rows[0] || null

// Chạy fn(c) trong 1 transaction (c.query như pool.query): lỗi giữa chừng thì giữ nguyên dữ liệu cũ.
async function tx(fn) {
  const c = await getPool().connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

module.exports = { query, rows, one, tx, getPool }

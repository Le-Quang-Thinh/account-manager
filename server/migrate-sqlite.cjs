// Chuyển dữ liệu 1 lần từ SQLite cũ (data/app.db) sang Supabase: user (giữ nguyên mật khẩu), account, Green Raid, liên kết Telegram.
//   node server/migrate-sqlite.cjs [đường dẫn app.db]
// Cần đã chạy supabase/schema.sql và đặt DATABASE_URL. Từ chối chạy nếu bảng users trên Supabase đã có dữ liệu.
// Phiên đăng nhập không chuyển: mọi người đăng nhập lại 1 lần.
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { one, query, tx } = require('./db.cjs')

const file = process.argv[2] || path.join(__dirname, '..', 'data', 'app.db')
const src = new DatabaseSync(file, { readOnly: true })
const all = sql => src.prepare(sql).all()

// Đẩy rows (mảng object) vào bảng bằng jsonb_to_recordset, chia khúc để mỗi câu lệnh không quá lớn
async function copy(c, table, cols, rows) {
  const names = cols.map(x => x[0]).join(', ')
  const defs = cols.map(x => `${x[0]} ${x[1]}`).join(', ')
  for (let i = 0; i < rows.length; i += 2000) {
    await c.query(`INSERT INTO ${table} (${names}) SELECT ${names} FROM jsonb_to_recordset($1::jsonb) AS t(${defs})`, [JSON.stringify(rows.slice(i, i + 2000))])
  }
  console.log(`  ${table}: ${rows.length}`)
}

async function main() {
  if ((await one('SELECT COUNT(*) AS n FROM users')).n > 0) throw new Error('Bảng users trên Supabase đã có dữ liệu, dừng để khỏi ghi chồng.')
  console.log('Đọc ' + file)
  await tx(async c => {
    await copy(c, 'users', [['id', 'bigint'], ['username', 'text'], ['pass_hash', 'text'], ['is_admin', 'boolean'], ['created_at', 'bigint']],
      all('SELECT id, username, pass_hash, is_admin != 0 AS is_admin, created_at FROM users').map(r => ({ ...r, is_admin: !!r.is_admin })))
    await copy(c, 'user_meta', [['user_id', 'bigint'], ['value', 'text']], all('SELECT user_id, value FROM user_meta'))
    await copy(c, 'accounts', [['user_id', 'bigint'], ['id', 'bigint'], ['raw', 'text'], ['acc_user', 'text'], ['batch', 'int'], ['status', 'text'],
      ['in_list', 'boolean'], ['note', 'text'], ['sale', 'text'], ['sold_at', 'bigint'], ['prev', 'text'], ['added_at', 'bigint']],
    all('SELECT user_id, id, raw, user AS acc_user, batch, status, in_list, note, sale, sold_at, prev, added_at FROM accounts').map(r => ({ ...r, in_list: !!r.in_list })))
    await copy(c, 'greenraid_batches', [['user_id', 'bigint'], ['id', 'text'], ['pos', 'int'], ['name', 'text'], ['file_name', 'text']],
      all('SELECT user_id, id, pos, name, file_name FROM greenraid_batches'))
    await copy(c, 'greenraid_accounts', [['user_id', 'bigint'], ['id', 'text'], ['batch_id', 'text'], ['pos', 'int'], ['text', 'text'], ['checked', 'boolean'],
      ['fail_label', 'text'], ['special', 'boolean'], ['exported', 'boolean'], ['export_batch_id', 'text']],
    all('SELECT * FROM greenraid_accounts').map(r => ({ ...r, checked: !!r.checked, special: !!r.special, exported: !!r.exported })))
    await copy(c, 'greenraid_history', [['user_id', 'bigint'], ['id', 'text'], ['pos', 'int'], ['name', 'text'], ['count', 'int'], ['created_at', 'bigint']],
      all('SELECT user_id, id, pos, name, count, created_at FROM greenraid_history'))
    await copy(c, 'greenraid_meta', [['user_id', 'bigint'], ['rev', 'bigint'], ['updated_at', 'bigint']], all('SELECT user_id, rev, updated_at FROM greenraid_meta'))
    await copy(c, 'telegram_links', [['chat_id', 'bigint'], ['user_id', 'bigint'], ['linked_at', 'bigint']], all('SELECT chat_id, user_id, linked_at FROM telegram_links'))
    // id user đã chèn thủ công nên đẩy bộ đếm tự tăng lên sau id lớn nhất
    await c.query(`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM users), 1))`)
  })
  console.log('Xong.')
}
main().then(() => process.exit(0)).catch(e => { console.error('Lỗi, đã hoàn tác toàn bộ:', e.message); process.exit(1) })

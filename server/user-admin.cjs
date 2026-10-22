// Thao tác quản lý user, dùng chung cho CLI (users.cjs) và bot Telegram. Lỗi nhập liệu ném Error có message tiếng Việt.
const { query, one, rows } = require('./db.cjs')
const { hashPassword } = require('./auth.cjs')

const find = name => one('SELECT id, username FROM users WHERE lower(username) = lower($1)', [name])

function checkName(name) {
  if (!name || !/^[\w.-]{3,32}$/.test(name)) throw new Error('Tên đăng nhập 3-32 ký tự: chữ, số, _ . -')
}
function checkPass(pass) {
  if (!pass || pass.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự')
}

async function addUser(name, pass, isAdmin = false) {
  checkName(name); checkPass(pass)
  if (await find(name)) throw new Error('User đã tồn tại')
  try {
    await query('INSERT INTO users (username, pass_hash, is_admin, created_at) VALUES ($1, $2, $3, $4)', [name, hashPassword(pass), !!isAdmin, Date.now()])
  } catch (e) {
    if (e.code === '23505') throw new Error('User đã tồn tại')
    throw e
  }
}
async function setPassword(name, pass) {
  checkPass(pass)
  const u = await find(name)
  if (!u) throw new Error('Không có user này')
  await query('UPDATE users SET pass_hash = $1 WHERE id = $2', [hashPassword(pass), u.id])
  await query('DELETE FROM sessions WHERE user_id = $1', [u.id]) // đăng xuất mọi thiết bị
}
async function delUser(name) {
  const u = await find(name)
  if (!u) throw new Error('Không có user này')
  await query('DELETE FROM users WHERE id = $1', [u.id]) // xoá luôn dữ liệu, phiên của user đó; liên kết Telegram thì bỏ user được chọn
}
const listUsers = () => rows(`SELECT u.id, u.username, u.is_admin AS "isAdmin",
  (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS n FROM users u ORDER BY u.id`)

module.exports = { addUser, setPassword, delUser, listUsers, find }

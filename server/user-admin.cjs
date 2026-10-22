// Thao tác quản lý user, dùng chung cho CLI (users.cjs) và bot Telegram. Lỗi nhập liệu ném Error có message tiếng Việt.
const { db } = require('./db.cjs')
const { hashPassword } = require('./auth.cjs')

const find = name => db.prepare('SELECT id, username FROM users WHERE username = ?').get(name)

function checkName(name) {
  if (!name || !/^[\w.-]{3,32}$/.test(name)) throw new Error('Tên đăng nhập 3-32 ký tự: chữ, số, _ . -')
}
function checkPass(pass) {
  if (!pass || pass.length < 8) throw new Error('Mật khẩu tối thiểu 8 ký tự')
}

function addUser(name, pass, isAdmin = false) {
  checkName(name); checkPass(pass)
  if (find(name)) throw new Error('User đã tồn tại')
  db.prepare('INSERT INTO users (username, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?)').run(name, hashPassword(pass), isAdmin ? 1 : 0, Date.now())
}
function setPassword(name, pass) {
  checkPass(pass)
  const u = find(name)
  if (!u) throw new Error('Không có user này')
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pass), u.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id) // đăng xuất mọi thiết bị
}
function delUser(name) {
  if (!find(name)) throw new Error('Không có user này')
  db.prepare('DELETE FROM users WHERE username = ?').run(name) // xoá luôn dữ liệu, phiên, liên kết Telegram của user đó
}
function listUsers() {
  return db.prepare(`SELECT u.id, u.username, u.is_admin AS isAdmin,
    (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS n FROM users u ORDER BY u.id`).all()
}

module.exports = { addUser, setPassword, delUser, listUsers, find }

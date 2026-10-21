// Quản lý người dùng (chỉ admin chạy trên máy chủ):
//   node server/users.cjs add <user> <mật khẩu> [--admin]
//   node server/users.cjs passwd <user> <mật khẩu mới>
//   node server/users.cjs del <user>      (xoá luôn toàn bộ dữ liệu của user đó)
//   node server/users.cjs list
const { db } = require('./db.cjs')
const { hashPassword } = require('./auth.cjs')

const args = process.argv.slice(2)
const isAdminFlag = args.includes('--admin')
const [cmd, name, pass0] = args.filter(a => a !== '--admin')
const flag = isAdminFlag ? '--admin' : ''
const find = u => db.prepare('SELECT id FROM users WHERE username = ?').get(u)
const fail = m => { console.error(m); process.exit(1) }
const checkPass = p => { if (!p || p.length < 8) fail('Mật khẩu tối thiểu 8 ký tự') }

// Không gõ mật khẩu trên dòng lệnh thì hỏi (ẩn ký tự), tránh lưu vào lịch sử terminal
function askPassword(label) {
  return new Promise(resolve => {
    process.stdout.write(label)
    const rl = require('readline').createInterface({ input: process.stdin, terminal: true })
    rl._writeToOutput = () => {}
    rl.question('', a => { rl.close(); process.stdout.write('\n'); resolve(a) })
  })
}

async function main() {
const pass = pass0 !== undefined ? pass0 : (cmd === 'add' || cmd === 'passwd') ? await askPassword('Mật khẩu (ẩn): ') : undefined
if (cmd === 'add') {
  if (!name || !/^[\w.-]{3,32}$/.test(name)) fail('Tên đăng nhập 3-32 ký tự: chữ, số, _ . -')
  checkPass(pass)
  if (find(name)) fail('User đã tồn tại')
  db.prepare('INSERT INTO users (username, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?)')
    .run(name, hashPassword(pass), flag === '--admin' ? 1 : 0, Date.now())
  console.log('Đã tạo user ' + name + (flag === '--admin' ? ' (admin)' : ''))
} else if (cmd === 'passwd') {
  checkPass(pass)
  if (!find(name)) fail('Không có user này')
  db.prepare('UPDATE users SET pass_hash = ? WHERE username = ?').run(hashPassword(pass), name)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(find(name).id) // đăng xuất mọi thiết bị
  console.log('Đã đổi mật khẩu ' + name)
} else if (cmd === 'del') {
  if (!find(name)) fail('Không có user này')
  db.prepare('DELETE FROM users WHERE username = ?').run(name)
  console.log('Đã xoá user ' + name)
} else if (cmd === 'list') {
  for (const u of db.prepare(`SELECT u.id, u.username, u.is_admin,
      (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS n FROM users u ORDER BY u.id`).all()) {
    console.log(`${u.id}\t${u.username}${u.is_admin ? ' (admin)' : ''}\t${u.n} account`)
  }
} else {
  fail('Dùng: add <user> <pass> [--admin] | passwd <user> <pass> | del <user> | list')
}
}
main()

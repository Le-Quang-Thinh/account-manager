// Quản lý người dùng (chỉ admin chạy trên máy chủ):
//   node server/users.cjs add <user> [mật khẩu] [--admin]
//   node server/users.cjs passwd <user> [mật khẩu mới]
//   node server/users.cjs del <user>      (xoá luôn toàn bộ dữ liệu của user đó)
//   node server/users.cjs list
const { addUser, setPassword, delUser, listUsers } = require('./user-admin.cjs')

const args = process.argv.slice(2)
const isAdmin = args.includes('--admin')
const [cmd, name, pass0] = args.filter(a => a !== '--admin')

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
  try {
    if (cmd === 'add' || cmd === 'passwd') {
      const pass = pass0 !== undefined ? pass0 : await askPassword('Mật khẩu (ẩn): ')
      if (cmd === 'add') { addUser(name, pass, isAdmin); console.log('Đã tạo user ' + name + (isAdmin ? ' (admin)' : '')) }
      else { setPassword(name, pass); console.log('Đã đổi mật khẩu ' + name) }
    } else if (cmd === 'del') {
      delUser(name); console.log('Đã xoá user ' + name)
    } else if (cmd === 'list') {
      for (const u of listUsers()) console.log(`${u.id}\t${u.username}${u.isAdmin ? ' (admin)' : ''}\t${u.n} account`)
    } else {
      throw new Error('Dùng: add <user> [pass] [--admin] | passwd <user> [pass] | del <user> | list')
    }
  } catch (e) { console.error(e.message); process.exit(1) }
}
main()

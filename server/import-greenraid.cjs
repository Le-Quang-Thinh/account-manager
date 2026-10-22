// Nhập 1 lần dữ liệu Green Raid từ file localStorage.json (dump của bản cũ) hoặc file backup vào DB của 1 user.
//   node server/import-greenraid.cjs <file.json> <username>
// Ghi đè toàn bộ dữ liệu Green Raid hiện có của user đó.
const fs = require('fs')
const { one } = require('./db.cjs')
const { writeGreenraid, readGreenraid } = require('./store-api.cjs')

const KEY = 'event-account-manager-v2-preview-safe'

// "16:32:53 26/9/2026" (bản cũ) -> timestamp
function legacyTime(v) {
  if (typeof v === 'number') return v
  const m = /(\d+):(\d+):(\d+)\s+(\d+)\/(\d+)\/(\d+)/.exec(String(v ?? ''))
  return m ? new Date(+m[6], +m[5] - 1, +m[4], +m[1], +m[2], +m[3]).getTime() : Date.now()
}

async function main() {
  const [file, username] = process.argv.slice(2)
  if (!file || !username) throw new Error('Dùng: node server/import-greenraid.cjs <file.json> <username>')
  const user = await one('SELECT id FROM users WHERE lower(username) = lower($1)', [username])
  if (!user) throw new Error('Không có user "' + username + '"')

  let d = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (typeof d[KEY] === 'string') d = JSON.parse(d[KEY])
  else if (d[KEY]) d = d[KEY]
  if (!Array.isArray(d.batches)) throw new Error('File không đúng dạng (không có batches)')
  const history = (Array.isArray(d.history) ? d.history : Array.isArray(d.exportHistory) ? d.exportHistory : [])
    .map(h => ({ id: h.id, name: h.name, count: h.count, createdAt: legacyTime(h.createdAt) }))

  const cur = await readGreenraid(user.id)
  await writeGreenraid(user.id, { baseRev: cur ? cur.rev : 0, batches: d.batches, history })
  const r = await readGreenraid(user.id)
  console.log(`Đã nhập cho "${username}": ${r.batches.length} batch, ${r.batches.reduce((s, b) => s + b.accounts.length, 0)} account, ${r.history.length} lần xuất (rev ${r.rev})`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1) })

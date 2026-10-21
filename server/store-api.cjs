// API lưu dữ liệu ra file JSON: GET đọc, PUT ghi. Dùng chung cho `vite` (dev) và `server.cjs` (production).
// File nằm ở data/accounts.json (đổi thư mục bằng biến môi trường DATA_DIR).
const fs = require('fs')
const path = require('path')

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(DIR, 'accounts.json')
const MAX_BYTES = 64 * 1024 * 1024

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

// Ghi nguyên tử: ghi file tạm rồi đổi tên, giữ lại bản trước đó ở accounts.json.bak
function writeFileSafe(text) {
  fs.mkdirSync(DIR, { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, text, 'utf8')
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak')
  fs.renameSync(tmp, FILE)
}

function storeApi(req, res) {
  if (req.method === 'GET') {
    try {
      send(res, 200, fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : 'null')
    } catch (e) {
      send(res, 500, JSON.stringify({ error: 'Không đọc được file dữ liệu: ' + e.message }))
    }
    return
  }
  if (req.method === 'PUT') {
    const chunks = []
    let size = 0
    let tooBig = false
    req.on('data', c => {
      size += c.length
      if (size > MAX_BYTES) tooBig = true
      else chunks.push(c)
    })
    req.on('end', () => {
      if (tooBig) return send(res, 413, JSON.stringify({ error: 'Dữ liệu quá lớn' }))
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        const j = JSON.parse(text)
        if (!j || !Array.isArray(j.accounts)) return send(res, 400, JSON.stringify({ error: 'Dữ liệu không hợp lệ' }))
        writeFileSafe(text)
        send(res, 200, JSON.stringify({ ok: true, accounts: j.accounts.length }))
      } catch (e) {
        send(res, 400, JSON.stringify({ error: 'Không ghi được: ' + e.message }))
      }
    })
    return
  }
  res.writeHead(405, { Allow: 'GET, PUT' })
  res.end()
}

module.exports = { storeApi, FILE }

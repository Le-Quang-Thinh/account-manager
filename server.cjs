// `npm start`: nếu chưa có dist/ thì tự build bằng Vite, rồi phục vụ site tĩnh.
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process')
const ROOT = path.join(__dirname, 'dist')
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.log('Chua co dist/, dang build...')
  const r = spawnSync(process.execPath, [path.join(__dirname, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: __dirname, stdio: 'inherit' })
  if (r.status !== 0) { console.error('Build that bai. Hay chay: npm install'); process.exit(1) }
}
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' }
http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  let f = path.normalize(path.join(ROOT, p))
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream',
    'Cache-Control': f.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(f).pipe(res)
}).listen(PORT, '0.0.0.0', () => console.log('Quan ly account dang chay o cong ' + PORT))

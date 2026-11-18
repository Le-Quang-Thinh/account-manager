// Đọc Google Sheet (log bắt Pokémon) cho bot Telegram, dùng Google Sheets API bằng API key.
// Sheet phải được chia sẻ "Anyone with the link can view" vì API key chỉ đọc được dữ liệu công khai.
// Env: GOOGLE_SHEETS_API_KEY (key AIza...), SHEET_ID (id file), tuỳ chọn SHEET_RANGE (mặc định "A:AF"),
//      SHEET_FIELDS (danh sách cột hiển thị, phân tách bằng dấu phẩy).
// Lệnh /sheet [n] chỉ lấy n dòng cuối (mặc định 5) — không lưu trạng thái gì.

const DEFAULT_RANGE = 'A:AF'
const DEFAULT_FIELDS = ['pokemon_name', 'caught_at_utc', 'username', 'size']
const DEFAULT_N = 5
const MAX_N = 20 // chặn trên để tin nhắn không quá dài

// Gọi Sheets API, trả về mảng 2 chiều values (gồm cả hàng header). Lỗi thì ném Error với thông báo rõ.
async function fetchValues() {
  const key = process.env.GOOGLE_SHEETS_API_KEY
  const id = process.env.SHEET_ID
  if (!key) throw new Error('Server chưa đặt GOOGLE_SHEETS_API_KEY.')
  if (!id) throw new Error('Server chưa đặt SHEET_ID.')
  const range = process.env.SHEET_RANGE || DEFAULT_RANGE
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`
    + `/values/${encodeURIComponent(range)}?key=${encodeURIComponent(key)}`
  const r = await fetch(url)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = j.error && j.error.message || ('HTTP ' + r.status)
    if (r.status === 403) throw new Error('Không đọc được sheet (403). Kiểm tra sheet đã chia sẻ "Anyone with the link can view" và API key có bật Google Sheets API chưa.')
    if (r.status === 400) throw new Error('Range sai (400): ' + msg + '. Kiểm tra SHEET_RANGE.')
    if (r.status === 404) throw new Error('Không tìm thấy sheet (404). Kiểm tra SHEET_ID.')
    throw new Error('Sheets API: ' + msg)
  }
  return j.values || []
}

// Tách header + dòng dữ liệu. map: tên cột (chữ thường) -> chỉ số cột.
function parse(values) {
  if (!values.length) return { map: {}, header: [], dataRows: [] }
  const header = values[0].map(h => String(h || '').trim())
  const map = {}
  header.forEach((h, i) => { if (h && !(h.toLowerCase() in map)) map[h.toLowerCase()] = i })
  return { map, header, dataRows: values.slice(1) }
}

const cell = (row, idx) => (idx == null || idx < 0 ? '' : String(row[idx] ?? '').trim())
const isTrue = v => /^(true|1|yes|x|có|co|✓|shiny)$/i.test(String(v).trim())

// Đổi mốc thời gian UTC sang giờ Việt Nam, dạng "dd/MM HH:mm". Không parse được thì giữ nguyên.
function fmtVN(v) {
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = t => (parts.find(x => x.type === t) || {}).value || ''
  return `${g('day')}/${g('month')} ${g('hour')}:${g('minute')}`
}

// Định dạng một dòng thành text gọn theo SHEET_FIELDS (hoặc mặc định). Bỏ qua ô rỗng.
function formatRow(map, row, fields) {
  const get = name => cell(row, map[name.toLowerCase()])
  const name = get('pokemon_name')
  const form = get('form_name')
  const showForm = form && !/\bnormal$/i.test(form) && form.toLowerCase() !== name.toLowerCase()
  const head = (name || '(không tên)') + (showForm ? ` (${form})` : '')
    + (isTrue(get('shiny')) ? ' ✨' : '')
  const parts = []
  for (const f of fields) {
    const key = f.toLowerCase()
    if (['pokemon_name', 'form_name', 'shiny'].includes(key)) continue // đã nằm ở dòng đầu
    const v = cell(row, map[key])
    if (!v) continue
    if (key === 'iv_percent') parts.push(`IV ${v}%`)
    else if (key === 'cp') parts.push(`CP ${v}`)
    else if (key.endsWith('_utc')) parts.push(fmtVN(v))
    else parts.push(v)
  }
  return `• ${head}` + (parts.length ? `\n   ${parts.join(' · ')}` : '')
}

function fieldList() {
  const raw = (process.env.SHEET_FIELDS || '').trim()
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_FIELDS
}

// N dòng cuối cùng của sheet. Trả về { total, n, text }.
async function lastRows(n = DEFAULT_N) {
  n = Math.max(1, Math.min(MAX_N, n || DEFAULT_N))
  const { map, dataRows } = parse(await fetchValues())
  const total = dataRows.length
  const fields = fieldList()
  const tail = dataRows.slice(Math.max(0, total - n))
  return { total, n: tail.length, text: tail.map(r => formatRow(map, r, fields)).join('\n') }
}

module.exports = { fetchValues, parse, lastRows, formatRow, fieldList, DEFAULT_N }

// Chạy tay để thử local: `node server/sheet.cjs` (5 dòng cuối), `node server/sheet.cjs 10`, `node server/sheet.cjs header`.
if (require.main === module) {
  try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')) } catch (e) { /* không có .env */ }
  const arg = process.argv[2]
  ;(async () => {
    if (arg === 'header') {
      const { header } = parse(await fetchValues())
      console.log('Cột:', header.map((h, i) => `${i}:${h}`).join('  '))
    } else {
      const { total, n, text } = await lastRows(Number(arg) || DEFAULT_N)
      console.log(`Tổng ${total} dòng. ${n} dòng cuối:\n\n` + (text || '(trống)'))
    }
    process.exit(0)
  })().catch(e => { console.error(e.message); process.exit(1) })
}

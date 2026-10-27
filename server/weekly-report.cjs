// Báo cáo tuần Notion → Telegram. Chỉ đọc Notion. Dùng cho `node report.js` (cron) và lệnh /report của bot.
// Env: NOTION_TOKEN, TELEGRAM_TOKEN (hoặc TELEGRAM_BOT_TOKEN), TELEGRAM_CHAT_ID; tuỳ chọn NOTION_DATA_SOURCE_ID, REPORT_TZ.
const API = 'https://api.notion.com/v1'
const VERSION = '2025-09-03'
const DEFAULT_DS = 'eef3c51a-5bbd-432b-a6f3-b8204826dba7'
const MAX_RETRY = 3
const MAX_LEN = 4000
const CUT_LEN = 3990

const SECTIONS = [
  ['Planned', '📌 Kế hoạch'],
  ['Completed', '✅ Hoàn thành'],
  ['Backlog', '📥 Backlog'],
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const plain = rt => (rt || []).map(t => t.plain_text).join('')
const tz = () => process.env.REPORT_TZ || 'Asia/Ho_Chi_Minh'

function requireEnv() {
  const miss = ['NOTION_TOKEN'].filter(k => !process.env[k])
  if (!process.env.TELEGRAM_TOKEN && !process.env.TELEGRAM_BOT_TOKEN) miss.push('TELEGRAM_TOKEN')
  if (miss.length) throw Object.assign(new Error('Thiếu biến môi trường: ' + miss.join(', ')), { fatal: true })
}

// Ngày hôm nay YYYY-MM-DD theo REPORT_TZ (en-CA cho đúng định dạng)
const todayIn = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(new Date())

// Gọi Notion, retry 429/5xx tối đa 3 lần (2, 4, 8 giây hoặc Retry-After). Không log token/response.
async function notion(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + process.env.NOTION_TOKEN, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (r.ok) return r.json()
    if ((r.status === 429 || r.status >= 500) && attempt < MAX_RETRY) {
      const ra = Number(r.headers.get('retry-after'))
      await sleep((ra > 0 ? ra : 2 ** (attempt + 1)) * 1000)
      continue
    }
    const j = await r.json().catch(() => ({}))
    const hint = r.status === 401 || r.status === 404 ? ' (kiểm tra NOTION_TOKEN và Connections của database)' : ''
    throw new Error(`Notion ${r.status} ${j.code || ''}: ${j.message || ''}${hint}`)
  }
}

async function getCurrentWeekPage(today) {
  const id = process.env.NOTION_DATA_SOURCE_ID || DEFAULT_DS
  const j = await notion('POST', `/data_sources/${id}/query`, {
    filter: { property: 'Period', date: { on_or_before: today } },
    sorts: [{ property: 'Period', direction: 'descending' }],
    page_size: 1,
  })
  return j.results[0]
}

async function getSections(pageId) {
  const out = { Planned: [], Completed: [], Backlog: [] }
  let cur = null, cursor
  do {
    const j = await notion('GET', `/blocks/${pageId}/children?page_size=100` + (cursor ? '&start_cursor=' + cursor : ''))
    for (const b of j.results) {
      const t = b[b.type]
      const text = t && t.rich_text ? plain(t.rich_text).trim() : ''
      if (/^heading_[123]$/.test(b.type)) { cur = text; continue }
      if (!text || !cur) continue
      const line = b.type === 'to_do' ? (t.checked ? '✅ ' : '⬜ ') + text
        : /^(bulleted_list_item|numbered_list_item|paragraph)$/.test(b.type) ? '• ' + text : null
      if (line) (out[cur] ||= []).push(line)
    }
    cursor = j.has_more ? j.next_cursor : null
  } while (cursor)
  return out
}

function buildMessage(page, sections) {
  const p = page.properties || {}
  const week = plain(p.Week && p.Week.title) || '(không tên)'
  const status = p.Status && p.Status.status ? p.Status.status.name : '—'
  const d = p.Period && p.Period.date
  const period = d ? d.start + (d.end ? ' → ' + d.end : '') : '—'
  const parts = [`📊 <b>${esc(week)}</b>\n🗓 ${esc(period)} | Trạng thái: ${esc(status)}`]
  for (const [key, label] of SECTIONS) {
    const items = sections[key] || []
    parts.push(`<b>${label}</b>\n` + (items.length ? items.map(esc).join('\n') : '<i>(trống)</i>'))
  }
  const msg = parts.join('\n\n')
  // Cắt thô có thể làm gãy thẻ HTML, nên cắt phần nội dung rồi đóng lại thẻ còn mở
  if (msg.length <= MAX_LEN) return msg
  let cut = msg.slice(0, CUT_LEN).replace(/&[a-z]*$/, '').replace(/<[^>]*$/, '')
  for (const tag of ['b', 'i']) {
    const opens = (cut.match(new RegExp(`<${tag}>`, 'g')) || []).length
    const closes = (cut.match(new RegExp(`</${tag}>`, 'g')) || []).length
    if (opens > closes) cut += `</${tag}>`
  }
  return cut + '…'
}

async function sendTelegram(text, chatId) {
  const token = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(`Telegram ${r.status}: ${j.description || ''}`)
  }
}

// chatId: chat nhận báo cáo, mặc định TELEGRAM_CHAT_ID. Không có chat nào thì chỉ in ra console (chưa gửi).
// Trả về { sent, week } ; sent=false nếu chưa có trang cho tuần này
async function sendWeeklyReport(chatId = process.env.TELEGRAM_CHAT_ID) {
  requireEnv()
  const stamp = new Date().toISOString()
  const page = await getCurrentWeekPage(todayIn())
  if (!page) {
    console.log(`${stamp} không có trang cho tuần hiện tại, không gửi`)
    return { sent: false }
  }
  const sections = await getSections(page.id)
  const week = plain(page.properties.Week && page.properties.Week.title)
  const msg = buildMessage(page, sections)
  const counts = SECTIONS.map(([k]) => `${k}=${(sections[k] || []).length}`).join(' ')
  if (!chatId) {
    console.log(`${stamp} "${week}" ${counts} chưa đặt TELEGRAM_CHAT_ID, in ra thay vì gửi:\n\n${msg}`)
    return { sent: false, week, printed: true }
  }
  await sendTelegram(msg, chatId)
  console.log(`${stamp} "${week}" ${counts} đã gửi`)
  return { sent: true, week }
}

module.exports = { notion, getCurrentWeekPage, getSections, buildMessage, sendTelegram, sendWeeklyReport }

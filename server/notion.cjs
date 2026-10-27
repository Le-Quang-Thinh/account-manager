// Đọc dữ liệu Notion cho bot Telegram. Cần NOTION_TOKEN (internal integration) và integration phải được share vào page/database.
// NOTION_DATABASE_ID là tuỳ chọn: database mặc định cho lệnh /ndb.
const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'
const MAX_BLOCKS = 100

async function call(path, body) {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error('Server chưa đặt NOTION_TOKEN.')
  const r = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.message || 'Notion HTTP ' + r.status)
  return j
}

const plain = rt => (rt || []).map(t => t.plain_text).join('')

function titleOf(obj) {
  if (obj.object === 'database') return plain(obj.title) || '(không tên)'
  const p = Object.values(obj.properties || {}).find(x => x.type === 'title')
  return (p && plain(p.title)) || '(không tên)'
}

function propText(p) {
  switch (p.type) {
    case 'title': return plain(p.title)
    case 'rich_text': return plain(p.rich_text)
    case 'number': return p.number ?? ''
    case 'select': return p.select ? p.select.name : ''
    case 'status': return p.status ? p.status.name : ''
    case 'multi_select': return p.multi_select.map(x => x.name).join(', ')
    case 'checkbox': return p.checkbox ? '✓' : '✗'
    case 'date': return p.date ? p.date.start + (p.date.end ? ' → ' + p.date.end : '') : ''
    case 'url': case 'email': case 'phone_number': return p[p.type] || ''
    case 'people': return p.people.map(x => x.name || x.id).join(', ')
    default: return ''
  }
}

// Chuẩn hoá id: nhận cả URL Notion hoặc id có/không có dấu gạch
function parseId(s) {
  const m = String(s || '').replace(/-/g, '').match(/[0-9a-f]{32}/i)
  return m ? m[0].toLowerCase() : null
}

async function search(query) {
  const j = await call('/search', { query, page_size: 10 })
  return j.results.map(x => ({ id: x.id, type: x.object, title: titleOf(x), url: x.url }))
}

async function queryDatabase(idOrUrl, limit = 15) {
  const id = parseId(idOrUrl || process.env.NOTION_DATABASE_ID)
  if (!id) throw new Error('Thiếu database id (đặt NOTION_DATABASE_ID hoặc truyền vào lệnh).')
  const j = await call(`/databases/${id}/query`, { page_size: limit })
  return j.results.map(pg => ({
    id: pg.id,
    url: pg.url,
    title: titleOf(pg),
    props: Object.entries(pg.properties)
      .filter(([, p]) => p.type !== 'title')
      .map(([k, p]) => [k, propText(p)])
      .filter(([, v]) => v !== ''),
  }))
}

async function readPage(idOrUrl) {
  const id = parseId(idOrUrl)
  if (!id) throw new Error('Id/URL page không hợp lệ.')
  const [page, blocks] = await Promise.all([call('/pages/' + id), call(`/blocks/${id}/children?page_size=${MAX_BLOCKS}`)])
  const lines = blocks.results.map(b => {
    const t = b[b.type]
    const text = t && t.rich_text ? plain(t.rich_text) : ''
    if (!text) return ''
    if (b.type.startsWith('heading')) return '\n' + text
    if (/list_item/.test(b.type)) return '• ' + text
    if (b.type === 'to_do') return (t.checked ? '☑ ' : '☐ ') + text
    return text
  }).filter(Boolean)
  return { title: titleOf(page), url: page.url, text: lines.join('\n'), more: blocks.has_more }
}

module.exports = { search, queryDatabase, readPage }

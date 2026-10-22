// Liên kết chat Telegram ↔ user. Chat nhập đúng TELEGRAM_LINK_SECRET (qua /link) thì được toàn quyền:
// xem dữ liệu của mọi user (chọn bằng /use) và quản lý user. Bảng telegram_links.user_id là user đang được chọn.
const crypto = require('crypto')
const { query, one } = require('./db.cjs')

const sha = t => crypto.createHash('sha256').update(String(t)).digest()
function secretOk(input) {
  const secret = process.env.TELEGRAM_LINK_SECRET
  if (!secret) return false
  return crypto.timingSafeEqual(sha(input), sha(secret))
}

const firstAdmin = async () => (await one('SELECT id, username FROM users WHERE is_admin ORDER BY id LIMIT 1'))
  || (await one('SELECT id, username FROM users ORDER BY id LIMIT 1'))

// Liên kết chat; user mặc định là admin đầu tiên (chưa có user nào thì để trống, tạo bằng /adduser).
async function linkChat(chatId) {
  const u = await firstAdmin()
  await query(`INSERT INTO telegram_links (chat_id, user_id, linked_at) VALUES ($1, $2, $3)
    ON CONFLICT (chat_id) DO UPDATE SET user_id = EXCLUDED.user_id, linked_at = EXCLUDED.linked_at`, [chatId, u ? u.id : null, Date.now()])
  return u
}
const isLinked = async chatId => !!(await one('SELECT 1 FROM telegram_links WHERE chat_id = $1', [chatId]))
// User đang được chọn của chat (null nếu chưa chọn / user đã bị xoá)
const userOfChat = chatId => one('SELECT u.id, u.username FROM telegram_links t JOIN users u ON u.id = t.user_id WHERE t.chat_id = $1', [chatId])
const switchUser = (chatId, userId) => query('UPDATE telegram_links SET user_id = $1 WHERE chat_id = $2', [userId, chatId])
const unlinkChat = async chatId => (await query('DELETE FROM telegram_links WHERE chat_id = $1', [chatId])).rowCount > 0

module.exports = { secretOk, linkChat, userOfChat, switchUser, unlinkChat, isLinked }

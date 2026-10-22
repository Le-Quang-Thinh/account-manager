// Liên kết chat Telegram ↔ user. Chat nhập đúng TELEGRAM_LINK_SECRET (qua /link) thì được toàn quyền:
// xem dữ liệu của mọi user (chọn bằng /use) và quản lý user. Bảng telegram_links.user_id là user đang được chọn.
const crypto = require('crypto')
const { db } = require('./db.cjs')

const sha = t => crypto.createHash('sha256').update(String(t)).digest()
function secretOk(input) {
  const secret = process.env.TELEGRAM_LINK_SECRET
  if (!secret) return false
  return crypto.timingSafeEqual(sha(input), sha(secret))
}

const firstAdmin = () => db.prepare('SELECT id, username FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1').get() || db.prepare('SELECT id, username FROM users ORDER BY id LIMIT 1').get() || null

// Liên kết chat; user mặc định là admin đầu tiên (chưa có user nào thì để trống, tạo bằng /adduser).
function linkChat(chatId) {
  const u = firstAdmin()
  db.prepare('INSERT OR REPLACE INTO telegram_links (chat_id, user_id, linked_at) VALUES (?, ?, ?)').run(chatId, u ? u.id : null, Date.now())
  return u
}
const isLinked = chatId => !!db.prepare('SELECT 1 FROM telegram_links WHERE chat_id = ?').get(chatId)
// User đang được chọn của chat (null nếu chưa chọn / user đã bị xoá)
const userOfChat = chatId => db.prepare('SELECT u.id, u.username FROM telegram_links t JOIN users u ON u.id = t.user_id WHERE t.chat_id = ?').get(chatId) || null
const switchUser = (chatId, userId) => db.prepare('UPDATE telegram_links SET user_id = ? WHERE chat_id = ?').run(userId, chatId)
const unlinkChat = chatId => db.prepare('DELETE FROM telegram_links WHERE chat_id = ?').run(chatId).changes > 0

module.exports = { secretOk, linkChat, userOfChat, switchUser, unlinkChat, isLinked }

// Webhook của bot Telegram. Đăng ký bằng: node server/bot-cli.cjs webhook https://<ten-mien>.vercel.app
import crypto from 'node:crypto'
import botMod from '../server/telegram-bot.cjs'

const sha = t => crypto.createHash('sha256').update(String(t)).digest()
let bot, ready

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
  const got = req.headers['x-telegram-bot-api-secret-token']
  if (!token || !secret || !got || !crypto.timingSafeEqual(sha(got), sha(secret))) { res.statusCode = 401; return res.end() }
  try {
    bot ??= botMod.createBot(token)
    ready ??= bot.init()
    await ready
    await bot.handleUpdate(req.body) // phải xong việc trước khi trả lời, serverless sẽ dừng ngay sau đó
  } catch (e) {
    console.error('Webhook loi:', e.message)
  }
  res.statusCode = 200 // luôn trả 200 để Telegram không gửi lại update lỗi liên tục
  res.end('ok')
}

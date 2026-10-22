// Quản lý bot Telegram từ máy local:
//   node server/bot-cli.cjs webhook <https://ten-mien.vercel.app>   đăng ký webhook (làm 1 lần sau khi deploy)
//   node server/bot-cli.cjs info                                    xem webhook đang trỏ đâu và lỗi gần nhất Telegram gặp
//   node server/bot-cli.cjs poll                                  chạy bot bằng long polling để thử local (tự gỡ webhook)
//   node server/bot-cli.cjs delete                                  gỡ webhook
// Cần TELEGRAM_BOT_TOKEN (và TELEGRAM_WEBHOOK_SECRET cho lệnh webhook) trong .env.
const { createBot } = require('./telegram-bot.cjs')

const token = process.env.TELEGRAM_BOT_TOKEN
const [cmd, arg] = process.argv.slice(2)
if (!token) { console.error('Chưa có TELEGRAM_BOT_TOKEN trong .env'); process.exit(1) }
const bot = createBot(token)

async function main() {
  if (cmd === 'webhook') {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!arg || !/^https:\/\//.test(arg)) throw new Error('Dùng: webhook https://ten-mien.vercel.app')
    if (!secret) throw new Error('Chưa có TELEGRAM_WEBHOOK_SECRET trong .env')
    const url = arg.replace(/\/+$/, '') + '/api/telegram'
    await bot.api.setWebhook(url, { secret_token: secret, drop_pending_updates: true })
    console.log('Đã đăng ký webhook: ' + url)
  } else if (cmd === 'info') {
    const i = await bot.api.getWebhookInfo()
    console.log('url:', i.url || '(chưa đăng ký webhook)')
    console.log('update đang chờ:', i.pending_update_count)
    console.log('lỗi gần nhất:', i.last_error_message || '(không có)', i.last_error_date ? '@ ' + new Date(i.last_error_date * 1000).toLocaleString() : '')
  } else if (cmd === 'delete') {
    await bot.api.deleteWebhook({ drop_pending_updates: true })
    console.log('Đã gỡ webhook')
  } else if (cmd === 'poll') {
    await bot.api.deleteWebhook({ drop_pending_updates: true })
    await bot.start({ onStart: me => console.log('Bot dang chay (polling): @' + me.username + ' - Ctrl+C de dung. Nho dang ky lai webhook sau khi xong.') })
  } else {
    throw new Error('Dùng: webhook <url> | info | poll | delete')
  }
}
main().then(() => { if (cmd !== 'poll') process.exit(0) }).catch(e => { console.error(e.message); process.exit(1) })

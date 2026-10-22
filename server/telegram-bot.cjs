// Bot Telegram. Chỉ trả dữ liệu cho chat đã liên kết bằng /link. Chạy bằng webhook trên Vercel (api/telegram.js);
// chạy máy local thì dùng `npm run bot -- poll` (long polling). Cần TELEGRAM_BOT_TOKEN.
const { Bot, InputFile } = require('grammy')
const { rows, one } = require('./db.cjs')
const { secretOk, linkChat, isLinked, userOfChat, switchUser, unlinkChat } = require('./telegram.cjs')
const { addGreenraidBatch } = require('./store-api.cjs')
const { addUser, setPassword, delUser, listUsers, find } = require('./user-admin.cjs')
const { lockedFor, noteFail, clearFails } = require('./throttle.cjs')

const STATUS = { farm: 'Farm', special: 'Special', sold: 'Đã bán' }
const MAX_SHOWN = 20
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

function createBot(token) {
  const bot = new Bot(token)

  // Mọi lệnh trừ /start, /help, /link đều cần chat đã liên kết
  // fn nhận (ctx, u): u là user đang được chọn, có thể là null (chưa có user nào)
  const guard = fn => async ctx => {
    if (!(await isLinked(ctx.chat.id))) return ctx.reply('Chat này chưa liên kết. Gửi: /link <mật khẩu liên kết>')
    return fn(ctx, await userOfChat(ctx.chat.id))
  }
  // Lệnh đọc dữ liệu: cần đã chọn user
  const withUser = fn => guard(async (ctx, u) => u ? fn(ctx, u) : ctx.reply('Chưa chọn user nào. Tạo bằng /adduser hoặc chọn bằng /use <user> (xem /users).'))

  const HELP = [
    '/stats – số account theo trạng thái',
    '/search <từ khoá> – tìm account',
    '/export farm|special|sold|all – nhận file .txt',
    'Gửi file .txt vào chat – import thành 1 batch Green Raid (caption = tên batch, bỏ trống thì lấy tên file)',
    '/whoami – đang xem dữ liệu của user nào',
    '/use <user> – chuyển sang xem dữ liệu của user khác',
    '/users – danh sách user',
    '/adduser <user> <mật khẩu> [admin] – tạo tài khoản đăng nhập web',
    '/passwd <user> <mật khẩu mới> – đổi mật khẩu',
    '/deluser <user> confirm – xoá user và toàn bộ dữ liệu',
    '/unlink – huỷ liên kết chat này',
  ].join('\n')

  bot.command(['start', 'help'], ctx => ctx.reply('Bot quản lý account.\n\n' + HELP))

  // Xoá tin nhắn chứa mật khẩu khỏi lịch sử chat. Phải await: serverless có thể dừng ngay khi đã trả lời xong.
  const wipe = ctx => ctx.deleteMessage().catch(() => {})

  bot.command('link', async ctx => {
    const key = 'link|' + ctx.chat.id
    if (await lockedFor(key)) return ctx.reply('Sai quá nhiều lần, thử lại sau ít phút.')
    if (!process.env.TELEGRAM_LINK_SECRET) return ctx.reply('Server chưa đặt TELEGRAM_LINK_SECRET nên chưa thể liên kết.')
    const secret = (ctx.match || '').trim()
    if (!secret) return ctx.reply('Dùng: /link <mật khẩu liên kết>')
    await wipe(ctx)
    if (!secretOk(secret)) {
      await noteFail(key)
      return ctx.reply('Sai mật khẩu liên kết.')
    }
    await clearFails(key)
    const u = await linkChat(ctx.chat.id)
    return ctx.reply('Đã liên kết (toàn quyền). ' + (u ? `Đang xem dữ liệu của "${u.username}".` : 'Chưa có user nào: tạo bằng /adduser <user> <mật khẩu> admin') + '\n\n' + HELP)
  })

  // Lệnh chứa mật khẩu: xoá tin nhắn sau khi xử lý
  const secretCmd = fn => guard(async (ctx, u) => { await wipe(ctx); return fn(ctx, u) })
  const words = ctx => (ctx.match || '').trim().split(/\s+/).filter(Boolean)
  const tryDo = async (ctx, fn) => { try { return await ctx.reply(await fn()) } catch (e) { return ctx.reply('Lỗi: ' + e.message) } }

  bot.command('whoami', guard(async (ctx, u) => ctx.reply(u ? `Đang xem dữ liệu của "${u.username}".` : 'Chưa chọn user nào.')))

  bot.command('use', guard(async (ctx) => {
    const [name] = words(ctx)
    const t = name && await find(name)
    if (!t) return ctx.reply('Dùng: /use <user>. Không có user này, xem /users.')
    await switchUser(ctx.chat.id, t.id)
    return ctx.reply(`Đã chuyển sang xem dữ liệu của "${t.username}".`)
  }))

  bot.command('users', guard(async (ctx, u) => {
    const lines = (await listUsers()).map(x => `${u && x.id === u.id ? '▶ ' : '   '}${x.username}${x.isAdmin ? ' (admin)' : ''} – ${x.n} account`)
    return ctx.reply(lines.join('\n') || 'Chưa có user nào.')
  }))

  bot.command('adduser', secretCmd(async (ctx, u) => {
    const [name, pass, flag] = words(ctx)
    if (!name || !pass) return ctx.reply('Dùng: /adduser <user> <mật khẩu> [admin]')
    return tryDo(ctx, async () => {
      await addUser(name, pass, flag === 'admin')
      if (!u) await switchUser(ctx.chat.id, (await find(name)).id)
      return `Đã tạo user "${name}"${flag === 'admin' ? ' (admin)' : ''}. Tin nhắn chứa mật khẩu đã được xoá.`
    })
  }))

  bot.command('passwd', secretCmd(async ctx => {
    const [name, pass] = words(ctx)
    if (!name || !pass) return ctx.reply('Dùng: /passwd <user> <mật khẩu mới>')
    return tryDo(ctx, async () => { await setPassword(name, pass); return `Đã đổi mật khẩu "${name}" và đăng xuất mọi thiết bị của user đó.` })
  }))

  bot.command('deluser', guard(async (ctx, u) => {
    const [name, confirm] = words(ctx)
    if (!name) return ctx.reply('Dùng: /deluser <user> confirm')
    if (confirm !== 'confirm') return ctx.reply(`Xoá "${name}" sẽ mất toàn bộ account của user đó, không hoàn tác. Gửi lại: /deluser ${name} confirm`)
    return tryDo(ctx, async () => {
      await delUser(name)
      return `Đã xoá user "${name}".` + (u && name.toLowerCase() === u.username.toLowerCase() ? ' Đây là user bạn đang xem, hãy chọn user khác bằng /use.' : '')
    })
  }))

  bot.command('unlink', guard(async ctx => {
    await unlinkChat(ctx.chat.id)
    return ctx.reply('Đã huỷ liên kết.')
  }))

  bot.command('stats', withUser(async (ctx, u) => {
    const r = await rows('SELECT status, COUNT(*) AS n FROM accounts WHERE user_id = $1 GROUP BY status', [u.id])
    const by = Object.fromEntries(r.map(x => [x.status, x.n]))
    const total = r.reduce((s, x) => s + x.n, 0)
    return ctx.reply(`${u.username}\n` + Object.entries(STATUS).map(([k, v]) => `${v}: ${by[k] || 0}`).join('\n') + `\nTổng: ${total}`)
  }))

  bot.command('search', withUser(async (ctx, u) => {
    const q = (ctx.match || '').trim()
    if (!q) return ctx.reply('Dùng: /search <từ khoá>')
    const like = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%'
    const where = 'user_id = $1 AND (raw ILIKE $2 OR note ILIKE $2)'
    const n = (await one(`SELECT COUNT(*) AS n FROM accounts WHERE ${where}`, [u.id, like])).n
    if (!n) return ctx.reply('Không có account nào khớp.')
    const found = await rows(`SELECT raw, status, note, batch FROM accounts WHERE ${where} ORDER BY id LIMIT ${MAX_SHOWN}`, [u.id, like])
    const lines = found.map(r => `${r.raw}\n   [${STATUS[r.status] || r.status} · Batch ${r.batch}${r.note ? ' · ' + r.note : ''}]`)
    return ctx.reply(`${n} kết quả` + (n > MAX_SHOWN ? ` (hiện ${MAX_SHOWN} đầu, dùng /export để lấy đủ)` : '') + ':\n\n' + lines.join('\n'))
  }))

  bot.command('export', withUser(async (ctx, u) => {
    const kind = (ctx.match || '').trim().toLowerCase()
    if (!['farm', 'special', 'sold', 'all'].includes(kind)) return ctx.reply('Dùng: /export farm | special | sold | all')
    const found = kind === 'all'
      ? await rows('SELECT raw FROM accounts WHERE user_id = $1 ORDER BY id', [u.id])
      : await rows('SELECT raw FROM accounts WHERE user_id = $1 AND status = $2 ORDER BY id', [u.id, kind])
    if (!found.length) return ctx.reply('Không có account nào.')
    const d = new Date(), p = n => String(n).padStart(2, '0')
    const name = `${kind}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.txt`
    return ctx.replyWithDocument(new InputFile(Buffer.from(found.map(r => r.raw).join('\r\n'), 'utf8'), name), { caption: `${found.length} account` })
  }))

  // Gửi file .txt vào chat = import thành 1 batch Green Raid của user đang chọn (tên batch = tên file, hoặc caption nếu có)
  bot.on('message:document', withUser(async (ctx, u) => {
    const doc = ctx.message.document
    const original = doc.file_name || ''
    const caption = (ctx.message.caption || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').trim()
    if (!/\.txt$/i.test(original) && doc.mime_type !== 'text/plain') return ctx.reply('Chỉ nhận file .txt (mỗi dòng một account).')
    if ((doc.file_size || 0) > MAX_IMPORT_BYTES) return ctx.reply('File quá lớn (tối đa 5MB).')
    try {
      const f = await ctx.api.getFile(doc.file_id)
      const r = await fetch(`https://api.telegram.org/file/bot${token}/${f.file_path}`)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const lines = (await r.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (!lines.length) return ctx.reply('File rỗng, không có dòng nào để import.')
      const name = (caption || original || 'telegram').replace(/\.txt$/i, '') + '.txt'
      const { batchCount } = await addGreenraidBatch(u.id, name, lines)
      return ctx.reply(`Đã import "${name}": ${lines.length} account vào Green Raid của "${u.username}" (hiện có ${batchCount} batch).`)
    } catch (e) {
      return ctx.reply('Không import được: ' + e.message)
    }
  }))

  bot.catch(err => console.error('Bot loi:', err.error && err.error.message || err.message))
  return bot
}

module.exports = { createBot }

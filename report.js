// Gửi báo cáo tuần Notion vào Telegram. Chạy tay: node report.js ; chạy theo lịch: cron hệ thống gọi lệnh này.
// Ví dụ crontab (giờ VN, 17:30 thứ 2–6):  CRON_TZ=Asia/Ho_Chi_Minh
//   30 17 * * 1-5  cd /duong/dan/project && node report.js >> report.log 2>&1
import { createRequire } from 'node:module'

try { process.loadEnvFile() } catch { /* không có .env thì dùng biến môi trường sẵn có */ }
const { sendWeeklyReport } = createRequire(import.meta.url)('./server/weekly-report.cjs')

try {
  await sendWeeklyReport()
} catch (e) {
  console.error(new Date().toISOString(), 'LỖI:', e.message)
  process.exit(1)
}

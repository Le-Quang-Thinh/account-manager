# Quản lý account (React + Vite)

Tool offline quản lý account game: nhập theo batch, đánh dấu Special bằng ghi chú dạng lựa chọn, bán, xuất .zip/.txt/.csv cho Xiaowei.

## Chạy thử
```
npm install
npm run dev        # http://localhost:5173
```

## Deploy lên Vercel + Supabase
Frontend là site Vite (`dist/`), API nằm ở `api/` (Vercel Functions), dữ liệu ở Postgres của Supabase.

1. **Supabase**: tạo project, vào SQL Editor chạy toàn bộ `supabase/schema.sql`. Lấy chuỗi kết nối ở Project Settings -> Database -> Connection string -> **Transaction pooler** (cổng 6543).
2. **Chạy local**: sao chép `.env.example` thành `.env`, điền `DATABASE_URL`, rồi `npm run dev`.
3. **Chuyển dữ liệu SQLite cũ** (nếu có `data/app.db`): `npm run migrate`. Giữ nguyên user và mật khẩu; mọi người đăng nhập lại 1 lần. Chưa có user thì tạo bằng `npm run user -- add <user> --admin`.
4. **Vercel**: import repo, framework Vite (đã có `vercel.json`). Đặt biến môi trường `DATABASE_URL`, và nếu dùng bot thì `TELEGRAM_BOT_TOKEN`, `TELEGRAM_LINK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`. Nên chọn region Functions gần region của Supabase.
5. **Bot Telegram** (webhook, không còn long polling): sau khi deploy, chạy 1 lần `npm run bot -- webhook https://<ten-mien>.vercel.app`. Muốn thử bot ở máy local thì `npm run bot -- poll` (tự gỡ webhook, nhớ đăng ký lại sau đó).

Giới hạn: body request của Vercel Functions tối đa ~4,5MB, nên dữ liệu một user vượt mức này thì không lưu được qua `PUT /api/store` và `/api/greenraid`.

## Dữ liệu
Dữ liệu lưu theo từng user trong Supabase, đăng nhập bằng user do admin tạo (`npm run user -- add|passwd|del|list` hoặc lệnh /adduser trong bot).
Chuyển từ bản HTML cũ sang: ở bản cũ bấm "Tải file sao lưu (.json)", ở bản này vào Nhập / Xuất bấm "Khôi phục từ file".
Nên tải file sao lưu thường xuyên.

## Cấu trúc
- `src/logic.js`: toàn bộ logic (import, batch, Special, bán, xác nhận, chia file, zip).
- `src/App.jsx`: state chung. `Rail.jsx` (thanh bên), `ListPage.jsx` (4 tab danh sách), `Tools.jsx` (Nhập / Xuất, cài đặt, sao lưu).
- `src/styles.css`: giao diện (sáng/tối), font nằm trong `src/fonts`.

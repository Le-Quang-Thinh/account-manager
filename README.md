# Quản lý account (React + Vite)

Tool offline quản lý account game: nhập theo batch, đánh dấu Special bằng ghi chú dạng lựa chọn, bán, xuất .zip/.txt/.csv cho Xiaowei.

## Chạy thử
```
npm install
npm run dev        # http://localhost:5173
```

## Build và deploy
```
npm run build      # ra thư mục dist/
```
Trên host Node (bot keep, Pterodactyl...): upload source, host tự `npm install`, rồi `npm run build`, rồi `npm start` (phục vụ dist/ ở cổng SERVER_PORT hoặc PORT). Nếu quên build, `npm start` tự build.

`dist/` là site tĩnh, upload lên bất kỳ host nào:
- **Vercel / Netlify / Cloudflare Pages**: Build command `npm run build`, Output directory `dist`.
- **GitHub Pages / hosting thường**: upload nội dung thư mục `dist/` (đã có sẵn trong zip này).

## Lưu ý dữ liệu
Dữ liệu lưu trong localStorage của trình duyệt, theo từng địa chỉ web (domain). Khác domain thì dữ liệu riêng.
Chuyển từ bản HTML cũ sang: ở bản cũ bấm "Tải file sao lưu (.json)", ở bản này vào Nhập / Xuất bấm "Khôi phục từ file".
Nên tải file sao lưu thường xuyên.

## Cấu trúc
- `src/logic.js`: toàn bộ logic (import, batch, Special, bán, xác nhận, chia file, zip).
- `src/App.jsx`: state chung. `Rail.jsx` (thanh bên), `ListPage.jsx` (4 tab danh sách), `Tools.jsx` (Nhập / Xuất, cài đặt, sao lưu).
- `src/styles.css`: giao diện (sáng/tối), font nằm trong `src/fonts`.

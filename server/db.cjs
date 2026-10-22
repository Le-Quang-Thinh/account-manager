// SQLite dùng chung cho API và bot. Cần Node >= 22.5 (module node:sqlite có sẵn, không cần cài thêm).
// File nằm ở data/app.db (đổi thư mục bằng biến môi trường DATA_DIR).
const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
const FILE = path.join(DIR, 'app.db')

fs.mkdirSync(DIR, { recursive: true })
const db = new DatabaseSync(FILE)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- Mỗi user một store riêng: id account chỉ duy nhất trong phạm vi user
  CREATE TABLE IF NOT EXISTS accounts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    raw TEXT NOT NULL,
    user TEXT NOT NULL,
    batch INTEGER NOT NULL,
    status TEXT NOT NULL,
    in_list INTEGER NOT NULL DEFAULT 1,
    note TEXT NOT NULL DEFAULT '',
    sale TEXT NOT NULL DEFAULT '',
    sold_at INTEGER,
    prev TEXT NOT NULL DEFAULT 'special',
    added_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id, user COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(user_id, status);

  -- settings, seq, batchSeq, batchMeta, tags... của từng user (JSON)
  CREATE TABLE IF NOT EXISTS user_meta (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    value TEXT NOT NULL
  );

  -- Quản lý Green Raid: mỗi user một bộ batch / account / lịch sử xuất; rev tăng mỗi lần ghi để phát hiện sửa từ máy khác
  CREATE TABLE IF NOT EXISTS greenraid_batches (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    pos INTEGER NOT NULL,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE IF NOT EXISTS greenraid_accounts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    pos INTEGER NOT NULL,
    text TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    fail_label TEXT NOT NULL DEFAULT '',
    special INTEGER NOT NULL DEFAULT 0,
    exported INTEGER NOT NULL DEFAULT 0,
    export_batch_id TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS idx_greenraid_accounts_batch ON greenraid_accounts(user_id, batch_id, pos);
  CREATE TABLE IF NOT EXISTS greenraid_history (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    pos INTEGER NOT NULL,
    name TEXT NOT NULL,
    count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE IF NOT EXISTS greenraid_meta (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Telegram: chat đã liên kết và user đang được chọn của chat đó
  CREATE TABLE IF NOT EXISTS telegram_links (
    chat_id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    linked_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_telegram_user ON telegram_links(user_id);
  DROP TABLE IF EXISTS link_codes;
`)

// Bản cũ của telegram_links bắt buộc có user_id (và xoá link khi xoá user): chuyển sang cho phép trống
if (db.prepare("SELECT \"notnull\" AS nn FROM pragma_table_info('telegram_links') WHERE name = 'user_id'").get().nn) {
  db.exec(`
    ALTER TABLE telegram_links RENAME TO telegram_links_old;
    CREATE TABLE telegram_links (
      chat_id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      linked_at INTEGER NOT NULL
    );
    INSERT INTO telegram_links SELECT chat_id, user_id, linked_at FROM telegram_links_old;
    DROP TABLE telegram_links_old;
    CREATE INDEX IF NOT EXISTS idx_telegram_user ON telegram_links(user_id);
  `)
}

// Chạy fn trong 1 transaction: lỗi giữa chừng thì giữ nguyên dữ liệu cũ.
function tx(fn) {
  db.exec('BEGIN')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

module.exports = { db, tx, FILE }

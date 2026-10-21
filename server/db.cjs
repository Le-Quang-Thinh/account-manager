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
`)

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

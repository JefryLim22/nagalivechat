-- =====================================================================
-- NagaLiveChat — skema database
-- Engine: SQLite (node:sqlite). Semua timestamp disimpan ISO-8601 UTC.
-- =====================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Workspace / organisasi. Satu akun bisa punya banyak user & project.
CREATE TABLE IF NOT EXISTS accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'starter',
  created_at    TEXT NOT NULL
);

-- Agent / owner yang login ke dashboard.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT 'Support Agent',
  role          TEXT NOT NULL DEFAULT 'agent',      -- owner | admin | agent
  avatar_color  TEXT NOT NULL DEFAULT '#6D5EF8',
  presence      TEXT NOT NULL DEFAULT 'offline',    -- online | away | offline
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);

-- Project = satu "website/license". Menghasilkan license key untuk widget.
CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  license_key   TEXT NOT NULL UNIQUE,
  domain        TEXT NOT NULL DEFAULT '',
  settings      TEXT NOT NULL DEFAULT '{}',         -- JSON konfigurasi widget
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);

-- Pengunjung anonim yang membuka widget / direct link.
CREATE TABLE IF NOT EXISTS visitors (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uid           TEXT NOT NULL,                      -- id persisten di localStorage browser
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  ip            TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  browser       TEXT NOT NULL DEFAULT '',
  os            TEXT NOT NULL DEFAULT '',
  device        TEXT NOT NULL DEFAULT '',
  locale        TEXT NOT NULL DEFAULT '',
  timezone      TEXT NOT NULL DEFAULT '',
  referrer      TEXT NOT NULL DEFAULT '',
  current_url   TEXT NOT NULL DEFAULT '',
  page_title    TEXT NOT NULL DEFAULT '',
  visits        INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  UNIQUE(project_id, uid)
);
CREATE INDEX IF NOT EXISTS idx_visitors_project ON visitors(project_id);

-- Percakapan.
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visitor_id      TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  assigned_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | open | closed
  source          TEXT NOT NULL DEFAULT 'widget',   -- widget | direct-link
  subject         TEXT NOT NULL DEFAULT '',
  rating          INTEGER,                          -- 1 = good, -1 = bad
  rating_comment  TEXT NOT NULL DEFAULT '',
  unread_agent    INTEGER NOT NULL DEFAULT 0,
  unread_visitor  INTEGER NOT NULL DEFAULT 0,
  first_reply_at  TEXT,
  last_message_at TEXT,
  started_at      TEXT NOT NULL,
  closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_conv_account ON conversations(account_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_visitor ON conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON conversations(last_message_at DESC);

-- Pesan dalam percakapan.
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     TEXT NOT NULL,                    -- visitor | agent | system
  sender_id       TEXT,
  sender_name     TEXT NOT NULL DEFAULT '',
  sender_color    TEXT NOT NULL DEFAULT '#6D5EF8',
  body            TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'text',     -- text | system | rating
  read_at         TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

-- Catatan internal agent (tidak terlihat pengunjung).
CREATE TABLE IF NOT EXISTS notes (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name     TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_conv ON notes(conversation_id);

-- Balasan cepat / canned response.
CREATE TABLE IF NOT EXISTS canned_responses (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  shortcut    TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canned_account ON canned_responses(account_id);

-- Tag percakapan.
CREATE TABLE IF NOT EXISTS conversation_tags (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tag             TEXT NOT NULL,
  PRIMARY KEY (conversation_id, tag)
);

-- Pesan offline / ticket saat tidak ada agent online.
CREATE TABLE IF NOT EXISTS offline_messages (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  handled     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offline_account ON offline_messages(account_id);

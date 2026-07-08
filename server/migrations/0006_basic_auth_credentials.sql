CREATE TABLE basic_auth_credentials (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

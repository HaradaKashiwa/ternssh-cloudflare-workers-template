CREATE TABLE basic_auth_lockouts (
  client_key      TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_basic_auth_lockouts_locked_until ON basic_auth_lockouts(locked_until);

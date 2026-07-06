CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  email        TEXT UNIQUE,
  display_name TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users (id, email, display_name) VALUES ('default', NULL, 'Default');

CREATE TABLE credentials (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_credentials_user_id ON credentials(user_id);

CREATE TABLE servers (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  host           TEXT NOT NULL,
  port           INTEGER NOT NULL DEFAULT 22,
  username       TEXT NOT NULL,
  auth_type      TEXT NOT NULL CHECK (auth_type IN ('password', 'private_key')),
  credential_ref TEXT NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_servers_user_id ON servers(user_id);

CREATE TABLE dashboards (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  layout_json TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_dashboards_user_id ON dashboards(user_id);

CREATE TABLE dashboard_widgets (
  id           TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  config_json  TEXT,
  grid_x       INTEGER NOT NULL DEFAULT 0,
  grid_y       INTEGER NOT NULL DEFAULT 0,
  grid_w       INTEGER NOT NULL DEFAULT 4,
  grid_h       INTEGER NOT NULL DEFAULT 3
);

CREATE INDEX idx_widgets_dashboard_id ON dashboard_widgets(dashboard_id);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id  TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'active',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

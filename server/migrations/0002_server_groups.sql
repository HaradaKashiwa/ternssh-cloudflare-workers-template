CREATE TABLE server_groups (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES server_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_server_groups_user_id ON server_groups(user_id);
CREATE INDEX idx_server_groups_parent_id ON server_groups(parent_id);

ALTER TABLE servers ADD COLUMN group_id TEXT REFERENCES server_groups(id) ON DELETE SET NULL;
ALTER TABLE servers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_servers_group_id ON servers(group_id);

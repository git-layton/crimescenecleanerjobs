CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Default: require manual approval for imported jobs
INSERT OR IGNORE INTO site_settings (key, value, updated_at)
VALUES ('auto_publish_jobs', 'false', datetime('now'));

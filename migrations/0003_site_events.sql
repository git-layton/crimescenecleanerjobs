CREATE TABLE IF NOT EXISTS site_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_events_event ON site_events(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_created ON site_events(created_at DESC);

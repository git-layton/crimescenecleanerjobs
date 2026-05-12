ALTER TABLE jobs ADD COLUMN owner_email TEXT;
ALTER TABLE jobs ADD COLUMN last_edited_at TEXT;

CREATE TABLE IF NOT EXISTS post_edit_codes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_sent_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edit_codes_job ON post_edit_codes(job_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_edit_codes_email ON post_edit_codes(owner_email, created_at DESC);

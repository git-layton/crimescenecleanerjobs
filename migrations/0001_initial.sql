CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_url TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  location_type TEXT NOT NULL DEFAULT 'onsite',
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',
  pay_min REAL,
  pay_max REAL,
  pay_type TEXT NOT NULL DEFAULT 'Hourly',
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL,
  apply_url TEXT,
  contact_email TEXT,
  source_url TEXT,
  source_name TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1,
  valid_through TEXT,
  expires_at TEXT,
  published_at TEXT,
  indexed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_state_city ON jobs(state, city);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_source_url ON jobs(source_url) WHERE source_url IS NOT NULL AND source_url != '';

CREATE TABLE IF NOT EXISTS import_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running',
  query TEXT,
  location TEXT,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS job_import_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_url TEXT NOT NULL UNIQUE,
  source_name TEXT,
  title TEXT,
  company TEXT,
  city TEXT,
  state TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES import_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_candidates_status_discovered ON job_import_candidates(status, discovered_at DESC);

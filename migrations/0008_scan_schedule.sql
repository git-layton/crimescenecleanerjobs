INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES
  ('scan_interval_hours', '24', datetime('now')),
  ('scan_last_ran_at',    '',   datetime('now'));

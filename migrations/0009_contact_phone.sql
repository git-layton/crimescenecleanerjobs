ALTER TABLE jobs ADD COLUMN contact_phone TEXT NOT NULL DEFAULT '';

INSERT INTO site_settings (key, value, updated_at)
VALUES (
  'scan_queries',
  'biohazard technician;biohazard remediation specialist;bio-recovery technician;trauma scene cleanup technician;trauma and crime scene technician;crime scene cleanup technician;biohazard remediation technician;hazmat cleanup technician;unattended death cleanup;hoarding cleanup biohazard;decomposition cleanup technician;bloodborne pathogen cleanup technician;infectious disease cleanup;bodily fluid cleanup;restoration technician biohazard',
  datetime('now')
)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

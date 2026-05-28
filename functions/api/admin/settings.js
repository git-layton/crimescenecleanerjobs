import { json, problem, readJson, requireAdmin } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const rows = await env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));

  // Expose env-var defaults for keys not yet saved in DB, so the admin panel
  // always shows the EFFECTIVE value and never hides what scans will actually use.
  const envDefaults = {
    scan_queries:  env.JOB_SCAN_QUERIES   || null,
    scan_location: env.DEFAULT_SCAN_LOCATION || null,
  };
  // Track which keys are coming from env (not DB) so UI can flag them
  const fromEnv = {};
  for (const [key, val] of Object.entries(envDefaults)) {
    if (val && settings[key] == null) {
      settings[key] = val;
      fromEnv[key] = true;
    }
  }

  return json({ settings, fromEnv });
}

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await readJson(request);
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(key, String(value), now).run();
  }
  return json({ ok: true });
}

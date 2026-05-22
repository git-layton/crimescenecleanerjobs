import { json, problem, readJson, requireAdmin } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const rows = await env.DB.prepare('SELECT key, value FROM site_settings').all();
  const settings = Object.fromEntries((rows.results || []).map(r => [r.key, r.value]));
  return json({ settings });
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

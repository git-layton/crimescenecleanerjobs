import { json, problem, requireAdmin } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const rows = await env.DB.prepare(
    `SELECT id, status, query, location, discovered_count, candidate_count, published_count, error, started_at, finished_at
     FROM import_runs ORDER BY started_at DESC LIMIT 10`
  ).all();

  return json({ runs: rows.results || [] });
}

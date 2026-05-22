import { clampLimit, json, problem, requireAdmin } from '../../../_lib/http.js';
import { listCandidates } from '../../../_lib/jobs.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const url = new URL(request.url);
  const runId = url.searchParams.get('run_id');

  if (runId) {
    const rows = await env.DB.prepare(
      `SELECT id, run_id, source_url, source_name, confidence, status, payload, discovered_at
       FROM job_import_candidates WHERE run_id = ? ORDER BY discovered_at DESC LIMIT 50`
    ).bind(runId).all();
    const candidates = (rows.results || []).map(r => ({
      ...r,
      payload: r.payload ? JSON.parse(r.payload) : {},
    }));
    return json({ candidates });
  }

  const candidates = await listCandidates(
    env,
    url.searchParams.get('status') || 'pending',
    clampLimit(url.searchParams.get('limit'), 50, 200)
  );
  return json({ candidates });
}

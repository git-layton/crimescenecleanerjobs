import { clampLimit, json, problem, requireAdmin } from '../../../_lib/http.js';
import { listCandidates } from '../../../_lib/jobs.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const url = new URL(request.url);
  const candidates = await listCandidates(
    env,
    url.searchParams.get('status') || 'pending',
    clampLimit(url.searchParams.get('limit'), 50, 200)
  );
  return json({ candidates });
}

import { json, problem, requireAdmin } from '../../../../_lib/http.js';
import { rejectCandidate } from '../../../../_lib/jobs.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  await rejectCandidate(env, params.id);
  return json({ ok: true });
}

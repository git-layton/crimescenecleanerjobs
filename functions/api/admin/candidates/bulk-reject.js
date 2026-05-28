import { json, problem, readJson, requireAdmin } from '../../../_lib/http.js';

// POST /api/admin/candidates/bulk-reject
// Body: { ids: string[] }  — reject specific candidates
//   OR: { rejectAll: true } — reject ALL pending candidates
//   OR: { rejectAll: true, status: 'pending' } — reject by status (pending|published|all)
export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await readJson(request);
  const now = new Date().toISOString();

  if (body.rejectAll) {
    const status = body.status || 'pending';
    let result;
    if (status === 'all') {
      result = await env.DB.prepare(
        `UPDATE job_import_candidates SET status = 'rejected', discovered_at = discovered_at WHERE status IN ('pending', 'published')`
      ).run();
    } else {
      result = await env.DB.prepare(
        `UPDATE job_import_candidates SET status = 'rejected', discovered_at = discovered_at WHERE status = ?`
      ).bind(status).run();
    }
    return json({ rejected: result.meta?.changes ?? 0 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) return problem(400, 'Provide ids[] or rejectAll: true');

  // D1 doesn't support array binding in IN clauses cleanly, so batch individually
  let rejected = 0;
  for (const id of ids) {
    const r = await env.DB.prepare(
      `UPDATE job_import_candidates SET status = 'rejected' WHERE id = ? AND status != 'rejected'`
    ).bind(id).run();
    rejected += r.meta?.changes ?? 0;
  }
  return json({ rejected });
}

import { getSiteUrl, json, problem, requireAdmin } from '../../../../_lib/http.js';
import { approveCandidate, updateJobIndexTimestamp } from '../../../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../../../_lib/google-indexing.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  try {
    const job = await approveCandidate(env, params.id, {
      siteUrl: getSiteUrl(env, request),
      defaultStatus: 'active',
    });
    const indexing = await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(error => ({ error: error.message }));
    if (!indexing.error && !indexing.skipped) await updateJobIndexTimestamp(env, job.id);
    return json({ job, indexing });
  } catch (error) {
    return problem(400, error.message);
  }
}

import { getSiteUrl, isAdminRequest, json, problem, requireAdmin } from '../../_lib/http.js';
import { deleteJob, getJob, updateJob, updateJobIndexTimestamp } from '../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../_lib/google-indexing.js';

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const isAdmin = isAdminRequest(request, env);
  const job = await getJob(env, params.id, {
    includeInactive: isAdmin,
    siteUrl: getSiteUrl(env, request),
  });

  if (!job) return problem(404, 'Job not found.');
  return json({ job });
}

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const siteUrl = getSiteUrl(env, request);
  const job = await deleteJob(env, params.id);
  if (!job) return problem(404, 'Job not found.');

  await notifyGoogleIndexing(env, `${siteUrl}/jobs/${job.slug}`, 'URL_DELETED').catch(error => console.error(error));
  return json({ ok: true, job });
}

export async function onRequestPatch({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const siteUrl = getSiteUrl(env, request);
  const body = await request.json().catch(() => ({}));
  try {
    const job = await updateJob(env, params.id, body, { siteUrl });
    if (!job) return problem(404, 'Job not found.');

    let indexing = null;
    if (body.status === 'active') {
      indexing = await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(error => ({ error: error.message }));
      if (!indexing.error && !indexing.skipped) await updateJobIndexTimestamp(env, job.id);
    }
    if (body.status === 'expired' || body.status === 'rejected') {
      indexing = await notifyGoogleIndexing(env, job.detail_url, 'URL_DELETED').catch(error => ({ error: error.message }));
    }

    return json({ job, indexing });
  } catch (error) {
    return problem(400, error.message);
  }
}

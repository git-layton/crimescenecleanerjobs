import { getSiteUrl, json, problem, readJson, requireAdmin } from '../../_lib/http.js';
import { getJob, listJobs, updateJobIndexTimestamp } from '../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../_lib/google-indexing.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await readJson(request);
  const siteUrl = getSiteUrl(env, request);
  const jobs = body.id
    ? [await getJob(env, body.id, { includeInactive: false, siteUrl })].filter(Boolean)
    : await listJobs(env, { includeInactive: false, limit: 100, siteUrl });

  const results = [];
  for (const job of jobs) {
    const result = await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(error => ({ error: error.message }));
    if (!result.error && !result.skipped) await updateJobIndexTimestamp(env, job.id);
    results.push({ id: job.id, url: job.detail_url, result });
  }

  return json({ results });
}

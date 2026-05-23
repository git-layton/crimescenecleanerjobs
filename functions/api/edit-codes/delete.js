import { getSiteUrl, json, problem } from '../../_lib/http.js';
import { verifyEditCode } from '../../_lib/edit-codes.js';
import { deleteJob, updateJob } from '../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../_lib/google-indexing.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const body = await request.json().catch(() => ({}));
  const { job: idOrSlug, code, action } = body;

  if (!idOrSlug || !code) return problem(400, 'job and code are required.');

  const siteUrl = getSiteUrl(env, request);
  const verified = await verifyEditCode(env, idOrSlug, code, { siteUrl }).catch(() => null);
  if (!verified) return problem(401, 'Invalid or expired edit code.');

  if (action === 'fill') {
    const job = await updateJob(env, verified.job.id, { ...verified.job, status: 'filled' }, { siteUrl });
    await notifyGoogleIndexing(env, job.detail_url, 'URL_DELETED').catch(() => {});
    return json({ ok: true, action: 'fill', job });
  }

  const deleted = await deleteJob(env, verified.job.id);
  if (!deleted) return problem(404, 'Job not found.');

  await notifyGoogleIndexing(env, `${siteUrl}/jobs/${deleted.slug}`, 'URL_DELETED').catch(() => {});
  return json({ ok: true, action: 'delete' });
}

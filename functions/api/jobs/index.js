import { clampLimit, getIp, getSiteUrl, isAdminRequest, isRateLimited, json, problem, readJson } from '../../_lib/http.js';
import { insertJob, listJobs } from '../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../_lib/google-indexing.js';
import { createEditCode } from '../../_lib/edit-codes.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const url = new URL(request.url);
  const isAdmin = isAdminRequest(request, env);
  const status = url.searchParams.get('status') || 'active';
  const includeInactive = isAdmin && status !== 'active';
  const jobs = await listJobs(env, {
    includeInactive,
    status,
    query: url.searchParams.get('q') || '',
    limit: clampLimit(url.searchParams.get('limit'), 100, 1000),
    siteUrl: getSiteUrl(env, request),
  });

  return json({ jobs });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  // 5 job posts per IP per hour for non-admins
  if (!isAdminRequest(request, env) && await isRateLimited(env, `rl:post:${getIp(request)}`, 5, 3600)) {
    return problem(429, 'Too many submissions. Try again later.');
  }

  const body = await readJson(request);
  const isAdmin = isAdminRequest(request, env);
  // Admin submissions are always active; imports always start pending for review; public posts pending
  const requestedStatus = isAdmin && body.source_type !== 'import' ? 'active' : 'pending';

  try {
    const siteUrl = getSiteUrl(env, request);
    const job = await insertJob(env, body, {
      defaultStatus: requestedStatus,
      siteUrl,
    });
    const edit = await createEditCode(env, job, {
      ownerEmail: body.owner_email || body.contact_email || '',
      siteUrl,
    });

    if (job.status === 'active') {
      await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(error => console.error(error));
    }

    return json({ job, edit }, 201);
  } catch (error) {
    return problem(400, error.message);
  }
}

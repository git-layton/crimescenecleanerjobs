import { getSiteUrl, json, problem, readJson } from '../../_lib/http.js';
import { verifyEditCode } from '../../_lib/edit-codes.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const body = await readJson(request);
  const verified = await verifyEditCode(env, body.job || body.id || body.slug || '', body.code || '', {
    siteUrl: getSiteUrl(env, request),
  });

  if (!verified) return problem(401, 'Invalid or expired edit code.');
  return json({ job: verified.job, expires_at: verified.expires_at });
}

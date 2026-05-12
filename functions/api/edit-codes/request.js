import { getSiteUrl, json, problem, readJson } from '../../_lib/http.js';
import { requestEditCode } from '../../_lib/edit-codes.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const body = await readJson(request);
  const result = await requestEditCode(env, {
    idOrSlug: body.job || body.id || body.slug || '',
    email: body.email || '',
    siteUrl: getSiteUrl(env, request),
  });

  return json({
    ok: true,
    delivered: Boolean(result.delivered),
    edit_code: result.edit_code,
    expires_at: result.expires_at,
  });
}

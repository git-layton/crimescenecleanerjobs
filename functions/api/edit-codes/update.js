import { getSiteUrl, json, problem, readJson } from '../../_lib/http.js';
import { updateJobWithEditCode } from '../../_lib/edit-codes.js';
import { notifyGoogleIndexing } from '../../_lib/google-indexing.js';

export async function onRequestPatch({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const body = await readJson(request);
  try {
    const result = await updateJobWithEditCode(env, {
      idOrSlug: body.job || body.id || body.slug || '',
      code: body.code || '',
      patch: body.jobData || body.patch || {},
      siteUrl: getSiteUrl(env, request),
    });
    if (result.was_active) {
      await notifyGoogleIndexing(env, result.job.detail_url, 'URL_DELETED').catch(error => console.error(error));
    }
    return json({ job: result.job });
  } catch (error) {
    return problem(401, error.message);
  }
}

import { getSiteUrl, json, problem } from '../../_lib/http.js';
import { buildJobPostingJsonLd, listJobs } from '../../_lib/jobs.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const siteUrl = getSiteUrl(env, request);
  const jobs = await listJobs(env, { includeInactive: false, limit: 500, siteUrl });
  return json({
    generated_at: new Date().toISOString(),
    jobs: jobs.map(job => ({
      url: job.detail_url,
      jobPosting: buildJobPostingJsonLd(job, siteUrl),
    })),
  }, 200, { 'Cache-Control': 'public, max-age=900' });
}

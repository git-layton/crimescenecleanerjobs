import { getSiteUrl, problem } from './_lib/http.js';
import { listJobs } from './_lib/jobs.js';

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const siteUrl = getSiteUrl(env, request);
  const jobs = await listJobs(env, { includeInactive: false, limit: 500, siteUrl });
  const urls = [
    { loc: siteUrl, lastmod: new Date().toISOString(), priority: '1.0' },
    ...jobs.map(job => ({
      loc: job.detail_url,
      lastmod: job.updated_at || job.created_at,
      priority: '0.8',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(url.lastmod)}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  });
}

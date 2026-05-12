import { getSiteUrl, html, problem } from '../_lib/http.js';
import { buildJobPostingJsonLd, getJob } from '../_lib/jobs.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPay(job) {
  if (!job.pay_min && !job.pay_max) return 'Pay negotiable';
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: job.currency || 'USD', maximumFractionDigits: 0 });
  const range = job.pay_min && job.pay_max
    ? `${formatter.format(job.pay_min)} - ${formatter.format(job.pay_max)}`
    : job.pay_min
      ? `From ${formatter.format(job.pay_min)}`
      : `Up to ${formatter.format(job.pay_max)}`;
  return `${range} ${job.paytype || ''}`.trim();
}

export async function onRequestGet({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');

  const siteUrl = getSiteUrl(env, request);
  const job = await getJob(env, params.slug, { siteUrl });
  if (!job) {
    return html('<!doctype html><title>Job not found</title><meta name="robots" content="noindex"><h1>Job not found</h1>', 404);
  }

  const jsonLd = buildJobPostingJsonLd(job, siteUrl);
  const title = `${job.title} at ${job.company} | CrimeSceneCleanerJobs`;
  const description = (job.description || '').replace(/\s+/g, ' ').slice(0, 155);
  const applyTarget = job.apply_url || (job.contact_email ? `mailto:${job.contact_email}` : job.source_url || '/');

  return html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="${escapeHtml(job.detail_url)}">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(job.detail_url)}">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
      :root { color-scheme: dark; font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; }
      body { margin: 0; background: #09090b; }
      main { max-width: 820px; margin: 0 auto; padding: 42px 20px 64px; }
      a { color: #f59e0b; }
      .eyebrow { color: #f59e0b; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { font-size: clamp(32px, 5vw, 54px); line-height: 1.05; margin: 12px 0 18px; letter-spacing: -0.03em; }
      .meta { color: #a1a1aa; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
      .panel { border: 1px solid #27272a; border-radius: 8px; background: #18181b; padding: 22px; margin: 22px 0; }
      .description { white-space: pre-wrap; line-height: 1.65; color: #d4d4d8; }
      .button { display: inline-block; background: #f59e0b; color: #09090b; text-decoration: none; padding: 13px 20px; border-radius: 6px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    </style>
  </head>
  <body>
    <main>
      <a href="/">CrimeSceneCleanerJobs</a>
      <p class="eyebrow">${escapeHtml(job.category)} role</p>
      <h1>${escapeHtml(job.title)}</h1>
      <div class="meta">
        <span>${escapeHtml(job.company)}</span>
        <span>${escapeHtml([job.city, job.state].filter(Boolean).join(', '))}</span>
        <span>${escapeHtml(formatPay(job))}</span>
      </div>
      <a class="button" href="${escapeHtml(applyTarget)}" rel="nofollow noopener">Apply now</a>
      <section class="panel">
        <h2>Job Details</h2>
        <div class="description">${escapeHtml(job.description)}</div>
      </section>
      ${job.source_url ? `<p>Original listing: <a href="${escapeHtml(job.source_url)}" rel="nofollow noopener">${escapeHtml(job.source_name || job.source_url)}</a></p>` : ''}
    </main>
  </body>
</html>`, 200, {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-src 'none';",
  });
}

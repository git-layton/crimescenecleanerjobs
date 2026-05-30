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

function sanitizeHtml(raw) {
  return String(raw || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/href="javascript:[^"]*"/gi, 'href="#"')
    .replace(/src="javascript:[^"]*"/gi, 'src=""');
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
    // Check if the job exists but is archived/expired — return 410 Gone so Google
    // deindexes it immediately rather than treating it as a crawl error.
    const archived = await getJob(env, params.slug, { siteUrl, includeInactive: true });
    if (archived && archived.status !== 'active') {
      return html('<!doctype html><title>Job no longer available</title><meta name="robots" content="noindex"><h1>This job is no longer available</h1>', 410);
    }
    return html('<!doctype html><title>Job not found</title><meta name="robots" content="noindex"><h1>Job not found</h1>', 404);
  }

  const siteName = env.SITE_NAME || 'NicheJobBoard';
  // Brand accent color — override via SITE_ACCENT_COLOR env var (hex, e.g. #0ea5e9)
  const accent = env.SITE_ACCENT_COLOR || '#f59e0b';
  const jsonLd = buildJobPostingJsonLd(job, siteUrl, siteName);
  const locationStr = [job.city, job.state].filter(Boolean).join(', ');
  const title = `${job.title} at ${job.company}${locationStr ? ` in ${locationStr}` : ''} | ${siteName}`;

  // Strip HTML tags for plain-text meta description
  const plainDesc = (job.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = plainDesc.slice(0, 155) ||
    `${job.title} job at ${job.company}${locationStr ? ` in ${locationStr}` : ''}. Apply now on ${siteName}.`;

  // Determine apply type
  const isPhone = (v) => v && /^\+?[\d\s\-()+]{7,}$/.test(String(v).trim());
  const contactEmail = job.contact_email || (job.contact && job.contact.includes('@') ? job.contact : null);
  const contactPhone = !contactEmail && isPhone(job.contact) ? job.contact : null;
  const applyType = job.apply_url ? 'url' : contactEmail ? 'email' : contactPhone ? 'phone' : 'url';
  const applyTarget = job.apply_url || (contactEmail ? `mailto:${contactEmail}` : contactPhone ? `tel:${contactPhone.replace(/\s/g, '')}` : '/');

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
      a { color: ${accent}; }
      .eyebrow { color: ${accent}; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { font-size: clamp(32px, 5vw, 54px); line-height: 1.05; margin: 12px 0 18px; letter-spacing: -0.03em; }
      .meta { color: #a1a1aa; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
      .panel { border: 1px solid #27272a; border-radius: 8px; background: #18181b; padding: 22px; margin: 22px 0; }
      .description { line-height: 1.65; color: #d4d4d8; }
      .description h2 { font-size: 0.7rem; font-weight: 700; margin: 1.75rem 0 0.6rem; color: ${accent}; text-transform: uppercase; letter-spacing: 0.1em; padding-top: 1rem; border-top: 1px solid #27272a; }
      .description h2:first-child { margin-top: 0; padding-top: 0; border-top: none; }
      .description h3 { font-size: 0.95rem; font-weight: 700; margin: 1rem 0 0.35rem; color: #e4e4e7; }
      .description ul { list-style: disc; padding-left: 1.5rem; margin: 0.25rem 0 1rem; }
      .description ol { list-style: decimal; padding-left: 1.5rem; margin: 0.25rem 0 1rem; }
      .description li { margin: 0.35rem 0; color: #d4d4d8; line-height: 1.5; }
      .description p { margin: 0 0 0.75rem; color: #d4d4d8; }
      .description strong { color: #f4f4f5; font-weight: 700; }
      .button { display: inline-block; background: ${accent}; color: #09090b; text-decoration: none; padding: 13px 20px; border-radius: 6px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
    </style>
  </head>
  <body>
    <main>
      <a href="/">${escapeHtml(siteName)}</a>
      <p class="eyebrow">${escapeHtml(job.category)} role</p>
      <h1>${escapeHtml(job.title)}</h1>
      <div class="meta">
        ${job.company_url
          ? `<span><a href="${escapeHtml(job.company_url)}" rel="noopener noreferrer" style="color:#f59e0b">${escapeHtml(job.company)}</a></span>`
          : `<span>${escapeHtml(job.company)}</span>`}
        <span><a href="https://www.google.com/maps/search/${encodeURIComponent([job.city, job.state].filter(Boolean).join(', '))}" target="_blank" rel="noopener noreferrer" style="color:inherit">${escapeHtml([job.city, job.state].filter(Boolean).join(', '))}</a></span>
        <span>${escapeHtml(formatPay(job))}</span>
      </div>
      ${applyType === 'url'
        ? `<a class="button" href="${escapeHtml(applyTarget)}" target="_blank" rel="nofollow noopener">Apply Online</a>`
        : applyType === 'email'
          ? `<div style="margin:18px 0;"><p style="color:#71717a;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">Apply by Email</p><a href="${escapeHtml(applyTarget)}" style="color:#f59e0b;font-family:monospace;font-size:15px;">${escapeHtml(contactEmail)}</a></div>`
          : applyType === 'phone'
            ? `<div style="margin:18px 0;"><p style="color:#71717a;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px;">Contact to Apply</p><span style="color:#e4e4e7;font-family:monospace;font-size:15px;">${escapeHtml(contactPhone)}</span></div>`
            : ''}
      <section class="panel">
        <h2>Job Details</h2>
        <div class="description">${sanitizeHtml(job.description)}</div>
      </section>
      ${job.apply_url || job.contact_email ? `
      <section class="panel">
        <h2>How to Apply</h2>
        ${job.apply_url ? `<p><a href="${escapeHtml(job.apply_url)}" rel="nofollow noopener">${escapeHtml(job.apply_url)}</a></p>` : ''}
        ${job.contact_email && !job.apply_url ? `<p><a href="mailto:${escapeHtml(job.contact_email)}">${escapeHtml(job.contact_email)}</a></p>` : ''}
      </section>` : ''}
      ${job.source_url ? `<p>Original listing: <a href="${escapeHtml(job.source_url)}" rel="nofollow noopener">${escapeHtml(job.source_name || job.source_url)}</a></p>` : ''}
    </main>
  </body>
</html>`, 200, {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-src 'none';",
  });
}

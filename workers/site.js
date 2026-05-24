import { onRequestGet as getJobs, onRequestPost as postJob } from '../functions/api/jobs/index.js';
import { onRequestGet as getJob, onRequestDelete as deleteJob, onRequestPatch as patchJob } from '../functions/api/jobs/[id].js';
import { onRequestPost as parseJob } from '../functions/api/parse-job.js';
import { onRequestPost as scanJobs } from '../functions/api/admin/scan.js';
import { onRequestGet as getScanHistory } from '../functions/api/admin/scan-history.js';
import { onRequestGet as getAnalytics } from '../functions/api/admin/analytics.js';
import { onRequestPost as verifyAdminToken } from '../functions/api/admin/verify.js';
import { onRequestGet as getSettings, onRequestPatch as updateSettings } from '../functions/api/admin/settings.js';
import { onRequestGet as getCandidates } from '../functions/api/admin/candidates/index.js';
import { onRequestPost as approveCandidate } from '../functions/api/admin/candidates/[id]/approve.js';
import { onRequestPost as rejectCandidate } from '../functions/api/admin/candidates/[id]/reject.js';
import { onRequestPost as parseAndPublishCandidate } from '../functions/api/admin/candidates/[id]/parse-and-publish.js';
import { onRequestPost as importUrlCandidate } from '../functions/api/admin/candidates/import-url.js';
import { onRequestPost as requestEditCode } from '../functions/api/edit-codes/request.js';
import { onRequestPost as verifyEditCode } from '../functions/api/edit-codes/verify.js';
import { onRequestPatch as updateWithEditCode } from '../functions/api/edit-codes/update.js';
import { onRequestPost as deleteOrFillWithEditCode } from '../functions/api/edit-codes/delete.js';
import { onRequestPost as verifyPromo } from '../functions/api/checkout/verify-promo.js';
import { onRequestPost as logEvent, onRequestGet as getEvents } from '../functions/api/events.js';
import { onRequestPost as requestIndexing } from '../functions/api/admin/indexing.js';
import { onRequestGet as getGoogleJobsFeed } from '../functions/api/google/jobs.json.js';
import { onRequestGet as getSitemap } from '../functions/sitemap.xml.js';
import { onRequestGet as getJobPage } from '../functions/jobs/[slug].js';
import { runDailyImport, maybeRunScheduledScan } from '../functions/_lib/agent.js';

function injectSiteConfig(response, env) {
  const name = env.SITE_NAME || 'CrimeSceneCleanerJobs';
  const siteUrl = env.PUBLIC_SITE_URL || '';
  const config = {
    name,
    title: env.SITE_TITLE || `${name} — Find Your Next Mission`,
    description: env.SITE_DESCRIPTION || `${name} is the premier niche job board.`,
    tagline: env.SITE_TAGLINE || `The premier job board for ${name} professionals.`,
    heroHeadline: env.SITE_HERO_HEADLINE || 'Find Your Next Mission.',
    heroSubheading: env.SITE_HERO_SUBHEADING || '',
    brandLabel: env.SITE_BRAND_LABEL || 'Niche Job Board',
    nicheDescription: env.NICHE_DESCRIPTION || name,
    nicheQuery: env.NICHE_EXAMPLE_QUERY || `where can I find ${name} jobs?`,
    stripeUrl: env.STRIPE_CHECKOUT_URL || '',
    siteUrl,
  };
  const script = `<script>window.SITE_CONFIG=${JSON.stringify(config)}</script>`;
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(config.title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', config.description); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', config.title); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', config.tagline); } })
    .on('meta[property="og:url"]', { element(el) { if (siteUrl) el.setAttribute('content', siteUrl); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', config.title); } })
    .on('meta[name="twitter:description"]', { element(el) { el.setAttribute('content', config.tagline); } })
    .on('link[rel="canonical"]', { element(el) { if (siteUrl) el.setAttribute('href', siteUrl); } })
    .on('head', { element(el) { el.append(script, { html: true }); } })
    .transform(response);
}

const methodNotAllowed = () => new Response('Method not allowed', {
  status: 405,
  headers: { Allow: 'GET, POST, PATCH, DELETE' },
});

async function health(request, env) {
  const status = {
    ok: true,
    time: new Date().toISOString(),
    site_url: env.PUBLIC_SITE_URL || new URL(request.url).origin,
    db_bound: Boolean(env.DB),
    admin_configured: Boolean(env.ADMIN_TOKEN),
    edit_code_pepper_configured: Boolean(env.EDIT_CODE_PEPPER),
    email_configured: Boolean(env.RESEND_API_KEY && env.FROM_EMAIL),
    ai_configured: Boolean(env.ANTHROPIC_API_KEY),
    google_search_configured: Boolean(env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_CX),
    brave_search_configured: Boolean(env.BRAVE_SEARCH_API_KEY),
    adzuna_configured: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
    counts: null,
  };

  if (env.DB) {
    try {
      const [countsResult, lastScan, scheduleRows] = await Promise.all([
        env.DB.prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY status").all(),
        env.DB.prepare("SELECT finished_at FROM import_runs WHERE status = 'complete' ORDER BY finished_at DESC LIMIT 1").first(),
        env.DB.prepare("SELECT key, value FROM site_settings WHERE key IN ('scan_interval_hours','scan_last_ran_at')").all(),
      ]);
      status.counts = Object.fromEntries((countsResult.results || []).map(row => [row.status, row.count]));
      status.last_scan_at = lastScan?.finished_at || null;
      const scheduleMap = Object.fromEntries((scheduleRows.results || []).map(r => [r.key, r.value]));
      status.scan_interval_hours = Number(scheduleMap.scan_interval_hours || 24);
      status.scan_last_ran_at = scheduleMap.scan_last_ran_at || null;
    } catch (error) {
      status.ok = false;
      status.db_error = error.message;
    }
  }

  return Response.json(status, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

function run(handler, request, env, ctx, params = {}) {
  return handler({ request, env, ctx, params, waitUntil: ctx.waitUntil?.bind(ctx) });
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Redirect .workers.dev to the canonical production domain
  const productionHost = (env.PUBLIC_SITE_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (productionHost && url.hostname !== productionHost && url.hostname.endsWith('.workers.dev')) {
    const canonical = new URL(request.url);
    canonical.hostname = productionHost;
    canonical.protocol = 'https:';
    return Response.redirect(canonical.toString(), 301);
  }

  // Redirect trailing slashes (except root) to canonical path
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    const canonical = new URL(request.url);
    canonical.pathname = url.pathname.replace(/\/+$/, '');
    return Response.redirect(canonical.toString(), 301);
  }

  const pathname = url.pathname || '/';

  if (pathname === '/api/health' && method === 'GET') {
    return health(request, env);
  }

  if (pathname === '/api/jobs') {
    if (method === 'GET') return run(getJobs, request, env, ctx);
    if (method === 'POST') return run(postJob, request, env, ctx);
    return methodNotAllowed();
  }

  const jobApiMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (jobApiMatch) {
    const params = { id: decodeURIComponent(jobApiMatch[1]) };
    if (method === 'GET') return run(getJob, request, env, ctx, params);
    if (method === 'DELETE') return run(deleteJob, request, env, ctx, params);
    if (method === 'PATCH') return run(patchJob, request, env, ctx, params);
    return methodNotAllowed();
  }

  if (pathname === '/api/parse-job' && method === 'POST') {
    return run(parseJob, request, env, ctx);
  }

  if (pathname === '/api/checkout/verify-promo' && method === 'POST') {
    return run(verifyPromo, request, env, ctx);
  }

  if (pathname === '/api/events') {
    if (method === 'POST') return run(logEvent, request, env, ctx);
    if (method === 'GET') return run(getEvents, request, env, ctx);
    return methodNotAllowed();
  }

  if (pathname === '/api/admin/verify' && method === 'POST') {
    return run(verifyAdminToken, request, env, ctx);
  }

  if (pathname === '/api/admin/scan' && method === 'POST') {
    return run(scanJobs, request, env, ctx);
  }

  if (pathname === '/api/admin/scan-history' && method === 'GET') {
    return run(getScanHistory, request, env, ctx);
  }

  if (pathname === '/api/admin/analytics' && method === 'GET') {
    return run(getAnalytics, request, env, ctx);
  }

  if (pathname === '/api/admin/settings') {
    if (method === 'GET') return run(getSettings, request, env, ctx);
    if (method === 'PATCH') return run(updateSettings, request, env, ctx);
    return methodNotAllowed();
  }

  if (pathname === '/api/admin/candidates' && method === 'GET') {
    return run(getCandidates, request, env, ctx);
  }

  if (pathname === '/api/admin/candidates/import-url' && method === 'POST') {
    return run(importUrlCandidate, request, env, ctx);
  }

  const candidateApproveMatch = pathname.match(/^\/api\/admin\/candidates\/([^/]+)\/approve$/);
  if (candidateApproveMatch && method === 'POST') {
    return run(approveCandidate, request, env, ctx, { id: decodeURIComponent(candidateApproveMatch[1]) });
  }

  const candidateRejectMatch = pathname.match(/^\/api\/admin\/candidates\/([^/]+)\/reject$/);
  if (candidateRejectMatch && method === 'POST') {
    return run(rejectCandidate, request, env, ctx, { id: decodeURIComponent(candidateRejectMatch[1]) });
  }

  const candidateParsePublishMatch = pathname.match(/^\/api\/admin\/candidates\/([^/]+)\/parse-and-publish$/);
  if (candidateParsePublishMatch && method === 'POST') {
    return run(parseAndPublishCandidate, request, env, ctx, { id: decodeURIComponent(candidateParsePublishMatch[1]) });
  }

  if (pathname === '/api/admin/indexing' && method === 'POST') {
    return run(requestIndexing, request, env, ctx);
  }

  if (pathname === '/api/edit-codes/request' && method === 'POST') {
    return run(requestEditCode, request, env, ctx);
  }

  if (pathname === '/api/edit-codes/verify' && method === 'POST') {
    return run(verifyEditCode, request, env, ctx);
  }

  if (pathname === '/api/edit-codes/update' && method === 'PATCH') {
    return run(updateWithEditCode, request, env, ctx);
  }

  if (pathname === '/api/edit-codes/delete' && method === 'POST') {
    return run(deleteOrFillWithEditCode, request, env, ctx);
  }

  if (pathname === '/api/google/jobs.json' && method === 'GET') {
    return run(getGoogleJobsFeed, request, env, ctx);
  }

  if (pathname === '/sitemap.xml' && method === 'GET') {
    return run(getSitemap, request, env, ctx);
  }

  const jobPageMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobPageMatch && method === 'GET') {
    return run(getJobPage, request, env, ctx, { slug: decodeURIComponent(jobPageMatch[1]) });
  }

  if (env.ASSETS) {
    const response = await env.ASSETS.fetch(request);
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('text/html')) return injectSiteConfig(response, env);
    return response;
  }

  return new Response('Not found', { status: 404 });
}

async function archiveExpiredJobs(env) {
  if (!env.DB) return;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE jobs SET status = 'archived', updated_at = ? WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?`
  ).bind(now, now).run();
}

export default {
  fetch(request, env, ctx) {
    return routeRequest(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    if (event.cron === '0 3 * * *') {
      ctx.waitUntil(archiveExpiredJobs(env));
    } else {
      ctx.waitUntil(maybeRunScheduledScan(env).catch(err => console.error('Scheduled scan error:', err)));
    }
  },
};

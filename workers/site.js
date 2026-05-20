import { onRequestGet as getJobs, onRequestPost as postJob } from '../functions/api/jobs/index.js';
import { onRequestGet as getJob, onRequestDelete as deleteJob, onRequestPatch as patchJob } from '../functions/api/jobs/[id].js';
import { onRequestPost as parseJob } from '../functions/api/parse-job.js';
import { onRequestPost as scanJobs } from '../functions/api/admin/scan.js';
import { onRequestGet as getCandidates } from '../functions/api/admin/candidates/index.js';
import { onRequestPost as approveCandidate } from '../functions/api/admin/candidates/[id]/approve.js';
import { onRequestPost as rejectCandidate } from '../functions/api/admin/candidates/[id]/reject.js';
import { onRequestPost as requestEditCode } from '../functions/api/edit-codes/request.js';
import { onRequestPost as verifyEditCode } from '../functions/api/edit-codes/verify.js';
import { onRequestPatch as updateWithEditCode } from '../functions/api/edit-codes/update.js';
import { onRequestPost as verifyPromo } from '../functions/api/checkout/verify-promo.js';
import { onRequestPost as requestIndexing } from '../functions/api/admin/indexing.js';
import { onRequestGet as getGoogleJobsFeed } from '../functions/api/google/jobs.json.js';
import { onRequestGet as getSitemap } from '../functions/sitemap.xml.js';
import { onRequestGet as getJobPage } from '../functions/jobs/[slug].js';

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
    openai_configured: Boolean(env.OPENAI_API_KEY),
    google_search_configured: Boolean(env.GOOGLE_SEARCH_API_KEY && env.GOOGLE_SEARCH_CX),
    adzuna_configured: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
    counts: null,
  };

  if (env.DB) {
    try {
      const result = await env.DB.prepare(
        "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status ORDER BY status"
      ).all();
      status.counts = Object.fromEntries((result.results || []).map(row => [row.status, row.count]));
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
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

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

  if (pathname === '/api/admin/scan' && method === 'POST') {
    return run(scanJobs, request, env, ctx);
  }

  if (pathname === '/api/admin/candidates' && method === 'GET') {
    return run(getCandidates, request, env, ctx);
  }

  const candidateApproveMatch = pathname.match(/^\/api\/admin\/candidates\/([^/]+)\/approve$/);
  if (candidateApproveMatch && method === 'POST') {
    return run(approveCandidate, request, env, ctx, { id: decodeURIComponent(candidateApproveMatch[1]) });
  }

  const candidateRejectMatch = pathname.match(/^\/api\/admin\/candidates\/([^/]+)\/reject$/);
  if (candidateRejectMatch && method === 'POST') {
    return run(rejectCandidate, request, env, ctx, { id: decodeURIComponent(candidateRejectMatch[1]) });
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
    return env.ASSETS.fetch(request);
  }

  return new Response('Not found', { status: 404 });
}

export default {
  fetch(request, env, ctx) {
    return routeRequest(request, env, ctx);
  },
};

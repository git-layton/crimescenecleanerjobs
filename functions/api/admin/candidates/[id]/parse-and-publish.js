import { getSiteUrl, json, problem, requireAdmin } from '../../../../_lib/http.js';
import { parseJobText } from '../../../../_lib/ai.js';
import { insertJob, updateJobIndexTimestamp } from '../../../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../../../_lib/google-indexing.js';

async function fetchSourceText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NicheJobBoardBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) return '';
  const html = (await response.text()).slice(0, 200000);
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16000);
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await request.json().catch(() => ({}));
  const overrides = body.overrides || {};

  const row = await env.DB.prepare('SELECT * FROM job_import_candidates WHERE id = ? LIMIT 1').bind(params.id).first();
  if (!row) return problem(404, 'Candidate not found.');

  const existingPayload = JSON.parse(row.payload_json || '{}');
  const sourceUrl = row.source_url || existingPayload.source_url;
  if (!sourceUrl) return problem(400, 'No source URL to fetch.');

  const sourceText = await fetchSourceText(sourceUrl);
  const hints = {
    source_url: sourceUrl,
    source_name: row.source_name,
    source_type: 'import',
    confidence: Number(row.confidence || 0),
    // Admin overrides take priority over AI result
    ...overrides,
  };
  const parsed = await parseJobText(env, sourceText || existingPayload.description || existingPayload.title || '', hints);

  const job = await insertJob(env, {
    ...parsed,
    // Admin overrides win over everything
    ...overrides,
    // If admin explicitly set apply_url (even to '') respect it; '' means "use alt contact, not web"
    apply_url: 'apply_url' in overrides ? (overrides.apply_url || null) : (parsed.apply_url || sourceUrl),
    source_type: 'import',
    source_url: sourceUrl,
    source_name: row.source_name,
    status: 'active',
  }, { defaultStatus: 'active', siteUrl: getSiteUrl(env, request) });

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE job_import_candidates SET status = ?, reviewed_at = ? WHERE id = ?'
  ).bind('approved', now, params.id).run();

  const indexing = await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(err => ({ error: err.message }));
  if (!indexing.error && !indexing.skipped) await updateJobIndexTimestamp(env, job.id);

  return json({ job, indexing });
}

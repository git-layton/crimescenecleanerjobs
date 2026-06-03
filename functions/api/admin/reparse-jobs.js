/**
 * POST /api/admin/reparse-jobs
 *
 * Re-fetches and re-parses published jobs whose descriptions look like they
 * were saved as raw plain text instead of proper HTML (i.e. they lack <h2> tags).
 * This happens when Claude hit the old max_tokens limit and JSON.parse threw,
 * causing a fallback to heuristicParse which returns unformatted text.
 *
 * Body params (all optional):
 *   limit        – max jobs to process per call (default 15, max 30)
 *   force        – if true, reparse ALL active jobs regardless of description quality
 *   status       – which job status to target (default "active")
 */

import { getSiteUrl, json, problem, requireAdmin } from '../../../_lib/http.js';
import { parseJobText } from '../../../_lib/ai.js';
import { JOB_COLUMNS, rowToJob, updateJobIndexTimestamp } from '../../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../../_lib/google-indexing.js';

const BLOCKED_SIGNALS = [
  'challenge-platform', 'cf-browser-verification',
  'enable JavaScript', '__cf_chl', 'Checking your browser',
];

function extractJobLd(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const t = item['@type'];
        if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return item;
      }
    } catch { /* skip malformed */ }
  }
  return null;
}

function jsonLdToHints(ld) {
  if (!ld) return {};
  const addr = ld.jobLocation?.address || ld.jobLocation || {};
  const sal = ld.baseSalary?.value || {};
  const payUnit = sal.unitText || '';
  return {
    title: ld.title || '',
    company: ld.hiringOrganization?.name || '',
    city: addr.addressLocality || '',
    state: addr.addressRegion || '',
    postal_code: addr.postalCode || '',
    description: ld.description || '',
    employment_type: Array.isArray(ld.employmentType) ? ld.employmentType[0] : (ld.employmentType || ''),
    apply_url: ld.url || '',
    pay_min: sal.minValue || sal.value || '',
    pay_max: sal.maxValue || '',
    pay_type: /hour/i.test(payUnit) ? 'Hourly' : /year|annual/i.test(payUnit) ? 'Salary' : '',
    valid_through: ld.validThrough || '',
  };
}

async function fetchSourcePage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!response.ok) return { text: '', ldHints: {} };
    const raw = await response.text();
    const html = raw.slice(0, 60000);
    if (BLOCKED_SIGNALS.some(s => html.includes(s))) return { text: '', ldHints: {} };
    const ld = extractJobLd(html);
    const text = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
    return { text, ldHints: jsonLdToHints(ld) };
  } catch {
    return { text: '', ldHints: {} };
  }
}

function needsReparse(job, force) {
  if (force) return true;
  const desc = job.description || '';
  // Plain text fallback: lacks HTML structure tags
  if (!desc.includes('<h2>') && !desc.includes('<p>') && !desc.includes('<ul>')) return true;
  // Very short description suggests truncation or empty parse
  if (desc.length < 200) return true;
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await request.json().catch(() => ({}));
  const rawLimit = Math.min(Number(body.limit) || 15, 30);
  const force = Boolean(body.force);
  const status = body.status || 'active';

  const siteUrl = getSiteUrl(env, request);

  // Fetch more than needed so we can filter to ones that actually need reparses
  const fetchLimit = force ? rawLimit : Math.min(rawLimit * 4, 120);
  const rows = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs WHERE status = ? AND source_url IS NOT NULL AND source_url != ''
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?`
  ).bind(status, fetchLimit).all();

  const jobs = (rows.results || [])
    .map(r => rowToJob(r, siteUrl))
    .filter(j => needsReparse(j, force))
    .slice(0, rawLimit);

  if (jobs.length === 0) {
    return json({ processed: 0, updated: 0, failed: 0, skipped: 0,
      message: 'No jobs need reparsing — all descriptions look healthy.' });
  }

  const results = { processed: jobs.length, updated: 0, failed: 0, skipped: 0, details: [] };

  for (const job of jobs) {
    try {
      const { text: sourceText, ldHints } = await fetchSourcePage(job.source_url);

      const hints = {
        title: job.title || '',
        company: job.company || '',
        city: job.city || '',
        state: job.state || '',
        apply_url: job.apply_url || '',
        contact_email: job.contact_email || '',
        contact_phone: job.contact_phone || '',
        source_url: job.source_url || '',
        source_name: job.source_name || '',
        source_type: job.source_type || 'import',
        confidence: job.confidence ?? 1,
        ...ldHints,
      };

      const inputText = sourceText || job.description || job.title || '';
      const parsed = await parseJobText(env, inputText, hints);

      // Only update description (and optionally pay/location) — never overwrite
      // identity fields like title, company, or apply_url with empty values.
      const newDesc = parsed.description || job.description;
      const hasImprovedDesc = newDesc && newDesc.includes('<h2>') && newDesc !== job.description;

      if (!hasImprovedDesc && !force) {
        results.skipped += 1;
        results.details.push({ id: job.id, slug: job.slug, result: 'skipped', reason: 'no improvement' });
        continue;
      }

      await env.DB.prepare(
        `UPDATE jobs SET description = ?, updated_at = ? WHERE id = ?`
      ).bind(newDesc, new Date().toISOString(), job.id).run();

      const indexing = await notifyGoogleIndexing(env, job.detail_url, 'URL_UPDATED').catch(() => ({ skipped: true }));
      if (!indexing.error && !indexing.skipped) await updateJobIndexTimestamp(env, job.id);

      results.updated += 1;
      results.details.push({ id: job.id, slug: job.slug, result: 'updated',
        descLength: newDesc.length, indexed: !indexing.error && !indexing.skipped });
    } catch (err) {
      results.failed += 1;
      results.details.push({ id: job.id, slug: job.slug, result: 'error', error: String(err.message) });
    }
  }

  return json(results);
}

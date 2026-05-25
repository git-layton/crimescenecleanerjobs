import { getSiteUrl, json, problem, requireAdmin } from '../../../../_lib/http.js';
import { parseJobText } from '../../../../_lib/ai.js';
import { insertJob, updateJobIndexTimestamp } from '../../../../_lib/jobs.js';
import { notifyGoogleIndexing } from '../../../../_lib/google-indexing.js';

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
    } catch { /* skip */ }
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
  };
}

// Pull company/location from URL structure before touching AI or DB.
// ZipRecruiter: /c/Company-Name/Job/Job-Title/-in-City,ST?jid=...
// Indeed:       /viewjob?jk=... (no structured info, skip)
function extractUrlHints(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('ziprecruiter.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      // parts[0] = 'c', parts[1] = 'Company-Name', parts[2] = 'Job', parts[3] = 'Job-Title', parts[4] = '-in-City,ST'
      if (parts[0] === 'c' && parts[1]) {
        const company = parts[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const hints = { company };
        const locPart = parts.find(p => p.startsWith('-in-'));
        if (locPart) {
          const loc = locPart.replace('-in-', '').split(',');
          if (loc[0]) hints.city = loc[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          if (loc[1]) hints.state = loc[1].trim().toUpperCase().slice(0, 2);
        }
        return hints;
      }
    }
  } catch { /* ignore */ }
  return {};
}

const BLOCKED_SIGNALS = ['challenge-platform', 'cf-browser-verification', 'enable JavaScript', '__cf_chl', 'Checking your browser'];

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
    const stripped = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);

    return { text: stripped, ldHints: jsonLdToHints(ld) };
  } catch {
    return { text: '', ldHints: {} };
  }
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  try {
  const body = await request.json().catch(() => ({}));
  const overrides = body.overrides || {};

  const row = await env.DB.prepare('SELECT * FROM job_import_candidates WHERE id = ? LIMIT 1').bind(params.id).first();
  if (!row) return problem(404, 'Candidate not found.');

  const existingPayload = JSON.parse(row.payload_json || '{}');
  const sourceUrl = row.source_url || existingPayload.source_url;
  if (!sourceUrl) return problem(400, 'No source URL to fetch.');

  const { text: sourceText, ldHints } = await fetchSourcePage(sourceUrl);

  // Extract structured hints from URL patterns before falling back to AI
  const urlHints = extractUrlHints(sourceUrl);

  const hints = {
    source_url: sourceUrl,
    source_name: row.source_name,
    source_type: 'import',
    confidence: Number(row.confidence || 0),
    // URL → JSON-LD → admin overrides (each layer can fill gaps from previous)
    ...urlHints,
    ...ldHints,
    ...overrides,
  };
  const inputText = sourceText || existingPayload.description || existingPayload.title || '';
  const parsed = await parseJobText(env, inputText, hints);

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
  } catch (err) {
    const msg = String(err?.message || err);
    // Validation failures are client errors, not server errors
    return problem(msg.startsWith('Missing required') ? 422 : 500, msg);
  }
}

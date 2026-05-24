import { getSiteUrl, json, problem, requireAdmin } from '../../../_lib/http.js';
import { parseJobText } from '../../../_lib/ai.js';
import { insertCandidate } from '../../../_lib/jobs.js';

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchSourceText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NicheJobBoardBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return stripHtml((await response.text()).slice(0, 200000)).slice(0, 16000);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await request.json().catch(() => ({}));
  const url = (body.url || '').trim();
  if (!url || !/^https?:\/\//.test(url)) return problem(400, 'A valid URL is required.');

  let sourceText = '';
  try {
    sourceText = await fetchSourceText(url);
  } catch (err) {
    return problem(422, `Could not fetch URL: ${err.message}`);
  }

  const sourceName = (() => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Direct Import'; }
  })();

  const hints = {
    source_url: url,
    source_name: sourceName,
    source_type: 'import',
    confidence: 0.6,
  };

  const parsed = await parseJobText(env, sourceText, hints);

  const candidate = await insertCandidate(env, {
    run_id: null,
    source_url: url,
    source_name: sourceName,
    confidence: parsed.confidence,
    payload: { ...parsed, source_url: url, source_name: sourceName },
  });

  if (!candidate) return problem(409, 'This URL has already been imported.');
  return json({ candidate }, 201);
}

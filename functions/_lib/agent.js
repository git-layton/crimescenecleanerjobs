import { parseJobText } from './ai.js';
import { insertCandidate, insertJob } from './jobs.js';

function splitConfigList(value, fallback) {
  if (!value) return fallback;
  return String(value).split(/\n|;/).map(item => item.trim()).filter(Boolean);
}

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
      'User-Agent': 'CrimeSceneCleanerJobsBot/1.0 (+https://crimescenecleanerjobs.com)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!response.ok) return '';
  return stripHtml((await response.text()).slice(0, 200000)).slice(0, 16000);
}

async function discoverWithGoogle(env, query, location) {
  if (!env.GOOGLE_SEARCH_API_KEY || !env.GOOGLE_SEARCH_CX) return [];
  const searchQuery = `${query} ${location} (jobs OR careers OR hiring OR apply)`;
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', env.GOOGLE_SEARCH_API_KEY);
  url.searchParams.set('cx', env.GOOGLE_SEARCH_CX);
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('num', '10');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google search failed: ${response.status}`);
  const payload = await response.json();
  return (payload.items || []).map(item => ({
    source_name: 'Google Programmable Search',
    source_url: item.link,
    title: item.title,
    snippet: item.snippet,
  }));
}

async function discoverWithAdzuna(env, query, location) {
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return [];
  const url = new URL('https://api.adzuna.com/v1/api/jobs/us/search/1');
  url.searchParams.set('app_id', env.ADZUNA_APP_ID);
  url.searchParams.set('app_key', env.ADZUNA_APP_KEY);
  url.searchParams.set('what', query);
  url.searchParams.set('where', location === 'Nationwide' ? 'United States' : location);
  url.searchParams.set('results_per_page', '20');
  url.searchParams.set('content-type', 'application/json');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Adzuna search failed: ${response.status}`);
  const payload = await response.json();
  return (payload.results || []).map(item => ({
    source_name: 'Adzuna',
    source_url: item.redirect_url,
    title: item.title,
    company: item.company?.display_name || '',
    city: item.location?.area?.slice(-2, -1)?.[0] || '',
    state: item.location?.area?.slice(-1)?.[0] || '',
    snippet: item.description,
    pay_min: item.salary_min || '',
    pay_max: item.salary_max || '',
    pay_type: item.salary_is_predicted ? 'Salary' : '',
  }));
}

async function discoverWithBrave(env, query, location) {
  if (!env.BRAVE_SEARCH_API_KEY) return [];
  const searchQuery = location && location.toLowerCase() !== 'nationwide'
    ? `${query} ${location} jobs hiring`
    : `${query} jobs hiring`;
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('count', '10');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('safesearch', 'off');

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY,
    },
  });
  if (!response.ok) throw new Error(`Brave search failed: ${response.status}`);
  const payload = await response.json();
  return (payload.web?.results || []).map(item => ({
    source_name: 'Brave Search',
    source_url: item.url,
    title: item.title,
    snippet: item.description || '',
  }));
}

async function discoverJobs(env, query, location) {
  const providerResults = await Promise.allSettled([
    discoverWithBrave(env, query, location),
    discoverWithGoogle(env, query, location),
    discoverWithAdzuna(env, query, location),
  ]);
  const items = providerResults.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const seen = new Set();
  return items.filter(item => {
    if (!item.source_url || seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });
}

async function createRun(env, query, location) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO import_runs (id, status, query, location, started_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, 'running', query, location, now).run();
  return id;
}

async function finishRun(env, id, summary, error = '') {
  await env.DB.prepare(
    'UPDATE import_runs SET status = ?, discovered_count = ?, candidate_count = ?, published_count = ?, error = ?, finished_at = ? WHERE id = ?'
  ).bind(
    error ? 'failed' : 'complete',
    summary.discovered || 0,
    summary.candidates || 0,
    summary.published || 0,
    error || null,
    new Date().toISOString(),
    id
  ).run();
}

async function getSetting(env, key) {
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key = ? LIMIT 1`).bind(key).first().catch(() => null);
  return row?.value ?? null;
}

export async function runDailyImport(env, options = {}) {
  // For cron trigger, check if scanning is enabled
  if (options.trigger === 'cron') {
    const enabled = await getSetting(env, 'scan_enabled');
    if (enabled === 'false') return { skipped: true, reason: 'Scanning disabled in admin settings' };
  }

  let queries;
  if (options.query) {
    queries = [options.query];
  } else {
    const dbQueries = await getSetting(env, 'scan_queries');
    queries = splitConfigList(
      dbQueries || env.JOB_SCAN_QUERIES,
      ['crime scene cleanup technician', 'biohazard remediation technician', 'trauma scene cleanup jobs', 'hazmat cleanup technician']
    );
  }

  const dbLocation = await getSetting(env, 'scan_location');
  const location = options.location || dbLocation || env.DEFAULT_SCAN_LOCATION || 'Nationwide';

  let autoPublish = options.autoPublish ?? (env.AUTO_PUBLISH_JOBS === 'true');
  if (!autoPublish) {
    const setting = await getSetting(env, 'auto_publish_jobs');
    if (setting === 'true') autoPublish = true;
  }
  const publishThreshold = Number(env.AUTO_PUBLISH_CONFIDENCE || 0.92);
  const summary = { discovered: 0, candidates: 0, published: 0, skipped: 0, errors: [] };
  const allCandidates = [];
  const runId = await createRun(env, queries.join('; '), location);

  // Build set of already-seen URLs so we skip duplicates without burning AI calls.
  // Jobs table: any time. Candidates: last 30 days (older ones may have expired or been cleaned up).
  const seenUrls = new Set();
  try {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
    const [jobRows, candidateRows] = await Promise.all([
      env.DB.prepare('SELECT source_url FROM jobs WHERE source_url IS NOT NULL AND source_url != ""').all(),
      env.DB.prepare('SELECT source_url FROM job_import_candidates WHERE discovered_at >= ?').bind(cutoff).all(),
    ]);
    for (const r of jobRows.results || []) seenUrls.add(r.source_url);
    for (const r of candidateRows.results || []) seenUrls.add(r.source_url);
  } catch (_) { /* non-fatal — proceed without dedup */ }

  try {
    for (const query of queries) {
      const discovered = await discoverJobs(env, query, location);
      summary.discovered += discovered.length;

      for (const item of discovered) {
        if (seenUrls.has(item.source_url)) { summary.skipped += 1; continue; }
        seenUrls.add(item.source_url);
        try {
          const sourceText = env.FETCH_SOURCE_PAGES === 'true'
            ? await fetchSourceText(item.source_url)
            : '';
          // Prior confidence by source: Adzuna provides structured job data (high prior),
          // Brave/Google return web pages that may or may not be job listings (low prior).
          // The AI parser overrides this with its own assessment — prior only affects heuristic fallback.
          const priorConfidence = item.source_name === 'Adzuna' ? 0.75 : 0.40;
          const parsed = await parseJobText(env, sourceText || item.snippet || item.title, {
            ...item,
            source_type: 'import',
            source_url: item.source_url,
            source_name: item.source_name,
            confidence: priorConfidence,
          });

          const payload = {
            ...parsed,
            source_type: 'import',
            source_url: item.source_url,
            source_name: item.source_name,
            description: parsed.description || sourceText || item.snippet || '',
          };
          const candidate = await insertCandidate(env, {
            run_id: runId,
            source_url: item.source_url,
            source_name: item.source_name,
            confidence: payload.confidence,
            payload,
          });

          if (candidate) {
            summary.candidates += 1;
            allCandidates.push(candidate);
          }

          if (autoPublish && Number(payload.confidence || 0) >= publishThreshold) {
            await insertJob(env, { ...payload, status: 'active' }, { defaultStatus: 'active' });
            summary.published += 1;
          }
        } catch (error) {
          summary.errors.push(error.message);
          summary.skipped += 1;
        }
      }
    }

    await finishRun(env, runId, summary);
    return { run_id: runId, ...summary, candidates_list: allCandidates };
  } catch (error) {
    await finishRun(env, runId, summary, error.message);
    throw error;
  }
}

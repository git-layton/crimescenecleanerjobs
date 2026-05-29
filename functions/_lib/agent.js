import { parseJobText } from './ai.js';
import { approveCandidate, insertCandidate, isJunkJob, listCandidates, rowToCandidate } from './jobs.js';

function splitConfigList(value, fallback) {
  if (!value) return fallback;
  return String(value).split(/\n|;/).map(item => item.trim()).filter(Boolean);
}

// Generic job-title words that appear across all niches — useless for relevance filtering.
const GENERIC_JOB_WORDS = new Set([
  'technician', 'specialist', 'manager', 'director', 'coordinator',
  'associate', 'analyst', 'engineer', 'professional', 'assistant',
  'supervisor', 'operator', 'administrator', 'representative',
  'position', 'opening', 'hiring', 'worker', 'service',
]);

// Extract niche-specific keywords from scan query strings.
// We keep words ≥ 7 chars that aren't in the generic list — these are the terms
// that distinguish the niche (e.g. "biohazard", "cleanup", "appliance", "installer").
function buildNicheKeywords(queries) {
  const words = queries
    .flatMap(q => q.toLowerCase().split(/[\s;,/()\-]+/))
    .filter(w => w.length >= 7 && !GENERIC_JOB_WORDS.has(w));
  return [...new Set(words)];
}

// Pre-screen a discovered search result BEFORE calling the AI.
// Returns false if the item's title/snippet contains none of the niche keywords,
// meaning Adzuna/Brave/Google probably returned an off-topic result.
// Bare URL items (no title or snippet) are always allowed through since we
// haven't fetched their content yet.
function isLikelyNicheRelevant(item, nicheKeywords) {
  const hasText = item.title || item.snippet;
  if (!hasText || !nicheKeywords.length) return true;
  const text = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  return nicheKeywords.some(kw => text.includes(kw));
}

// Extract JobPosting JSON-LD from raw HTML before stripping scripts.
// Many job boards (ZipRecruiter, Greenhouse, Lever, Workday, Glassdoor) embed
// complete structured job data here — far more reliable than parsing text.
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

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrlHints(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('ziprecruiter.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
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

async function braveSearch(env, searchQuery) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('count', '20');
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

async function discoverWithBrave(env, query, location) {
  if (!env.BRAVE_SEARCH_API_KEY) return [];
  const loc = location && location.toLowerCase() !== 'nationwide' ? ` ${location}` : '';

  // Run broad search + ATS-targeted searches in parallel.
  // Lever, Greenhouse, and Workable serve full HTML + JSON-LD and never block bots.
  // ZipRecruiter /c/ URLs work for URL-hint extraction even when 403 on page fetch.
  // LinkedIn is dropped — requires auth, adds no value.
  const searches = await Promise.allSettled([
    braveSearch(env, `${query}${loc} jobs hiring`),
    braveSearch(env, `${query}${loc} jobs -intitle:"sign in" -intitle:"login"`),
    braveSearch(env, `site:jobs.lever.co "${query}"`),
    braveSearch(env, `site:boards.greenhouse.io "${query}"`),
    braveSearch(env, `site:apply.workable.com "${query}"`),
    braveSearch(env, `site:ziprecruiter.com/c/ "${query}"`),
  ]);

  return searches.flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

function isSearchResultsPage(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const hasSearchQuery = u.searchParams.has('q') || u.searchParams.has('query')
      || u.searchParams.has('keyword') || u.searchParams.has('what')
      || u.searchParams.has('search') || u.searchParams.has('term');
    if (hasSearchQuery && (path.includes('/search') || path === '/jobs' || path === '/jobs/')) return true;
    if (path.endsWith('/search') || path.endsWith('/search/')) return true;
    return false;
  } catch {
    return false;
  }
}

function looksLikeIndividualJob(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path === '/' || path === '') return false;
    // Skip obvious non-job pages
    if (/\/(about|contact|login|signup|register|privacy|terms|blog|news|press|faq|help)\/?$/i.test(path)) return false;
    // Strong job signals in path
    if (/\/(job|jobs|career|careers|position|opening|vacancy|apply|listing)\/[^/]+/i.test(path)) return true;
    // ZipRecruiter: /c/Company/Job-Title?jid=... or ?jid= param
    if (/^\/c\/[^/]+\/[^/]+/.test(path)) return true;
    if (u.searchParams.has('jid')) return true;
    // Indeed / USAJobs / generic ATS job key params
    if (u.searchParams.has('jk') || u.searchParams.has('jobId') || u.searchParams.has('jobkey') || u.searchParams.has('JobID')) return true;
    // Generic: at least two path segments with a slug that looks like a job title or ID
    const segments = path.split('/').filter(Boolean);
    return segments.length >= 2 && segments[segments.length - 1].length > 8;
  } catch {
    return false;
  }
}

async function crawlForJobLinks(listingUrl, sourceName) {
  try {
    const response = await fetch(listingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NicheJobBoardBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return [];
    const html = await response.text();
    const base = new URL(listingUrl);

    const found = new Set();
    // Match both absolute and relative URLs (job boards often use relative paths)
    const hrefRe = /href=["']([^"'#\s]{5,500})["']/g;
    let match;
    while ((match = hrefRe.exec(html)) !== null) {
      let link = match[1];
      try {
        // Resolve relative URLs against the page's origin
        if (!link.startsWith('http')) link = new URL(link, base).href;
        if (!isSearchResultsPage(link) && looksLikeIndividualJob(link)) {
          found.add(link);
          if (found.size >= 30) break; // was 15 — increased for better coverage
        }
      } catch { /* invalid URL, skip */ }
    }
    return [...found].map(url => ({ source_name: sourceName, source_url: url, title: '', snippet: '' }));
  } catch {
    return [];
  }
}

async function discoverWithZipRecruiter(env, query, location) {
  const url = new URL('https://www.ziprecruiter.com/jobs-search');
  url.searchParams.set('search', query);
  if (location && location.toLowerCase() !== 'nationwide') url.searchParams.set('location', location);
  url.searchParams.set('days', '14'); // last 2 weeks
  return crawlForJobLinks(url.toString(), 'ZipRecruiter');
}

async function discoverWithIndeed(env, query, location) {
  const url = new URL('https://www.indeed.com/jobs');
  url.searchParams.set('q', query);
  url.searchParams.set('l', location && location.toLowerCase() !== 'nationwide' ? location : 'United States');
  url.searchParams.set('sort', 'date');
  return crawlForJobLinks(url.toString(), 'Indeed');
}

async function discoverJobs(env, query, location) {
  const providerResults = await Promise.allSettled([
    discoverWithBrave(env, query, location),
    discoverWithGoogle(env, query, location),
    discoverWithAdzuna(env, query, location),
    discoverWithZipRecruiter(env, query, location),
    discoverWithIndeed(env, query, location),
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

// ---------------------------------------------------------------------------
// Auto-publish: scan the full pending-candidates queue and publish anything
// that meets the quality bar.  Called at the end of every scan run when
// auto-publish is on, so the queue is always drained — not just new items.
// ---------------------------------------------------------------------------
export async function autoPublishEligibleCandidates(env, options = {}) {
  const threshold = options.threshold ?? 0.80;
  const limit     = options.limit    ?? 25;
  const siteUrl   = options.siteUrl  ?? '';

  // Fetch pending candidates at or above the confidence threshold
  const rows = await env.DB.prepare(
    `SELECT * FROM job_import_candidates
     WHERE status = 'pending' AND confidence >= ?
     ORDER BY confidence DESC, discovered_at ASC
     LIMIT ?`
  ).bind(threshold, limit).all();

  let published = 0;
  const errors = [];

  for (const row of rows.results || []) {
    const candidate = rowToCandidate(row);
    const payload   = candidate.payload || {};

    // Must have title + company + at least one apply/contact method
    const title    = payload.title    || candidate.title    || '';
    const company  = payload.company  || candidate.company  || '';
    const hasApply = payload.apply_url || payload.contact_email || payload.contact_phone
                     || candidate.source_url;

    if (!title || !company || !hasApply) continue;

    try {
      // approveCandidate validates, inserts as active, and marks candidate approved
      await approveCandidate(env, row.id, { siteUrl });
      published++;
    } catch (err) {
      errors.push(`${title}: ${err.message}`);
    }
  }

  return { published, errors };
}

export async function maybeRunScheduledScan(env) {
  const enabled = await getSetting(env, 'scan_enabled');
  if (enabled === 'false') return { skipped: true, reason: 'Scan disabled' };

  const intervalHours = Number(await getSetting(env, 'scan_interval_hours') || 24);
  const lastRanStr = await getSetting(env, 'scan_last_ran_at');
  if (lastRanStr) {
    const hoursSince = (Date.now() - new Date(lastRanStr).getTime()) / 3600000;
    if (hoursSince < intervalHours) return { skipped: true, reason: `Next scan in ${Math.round(intervalHours - hoursSince)}h` };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO site_settings (key, value, updated_at) VALUES ('scan_last_ran_at', ?, ?)"
  ).bind(now, now).run();

  return runDailyImport(env, { trigger: 'cron' });
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
  if (autoPublish) {
    const until = await getSetting(env, 'auto_publish_until');
    if (until && new Date() > new Date(until)) autoPublish = false;
  }
  // Threshold: DB setting wins, then env var, then safe default of 0.80.
  // (0.92 was too aggressive — Claude scores most real jobs 0.80–0.90.)
  const dbThreshold = await getSetting(env, 'auto_publish_confidence_threshold');
  const publishThreshold = dbThreshold !== null
    ? Number(dbThreshold)
    : Number(env.AUTO_PUBLISH_CONFIDENCE || 0.80);
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

  // Max new URLs to process per run — keeps wall-clock time under CF Worker limit.
  // Increase if the plan has a higher CPU budget.
  const MAX_PER_RUN = 40;
  let totalProcessed = 0;

  // Build niche keyword set once — used to skip clearly off-topic search results
  // before burning AI API calls on them.
  const nicheKeywords = buildNicheKeywords(queries);

  try {
    for (const query of queries) {
      if (totalProcessed >= MAX_PER_RUN) break;
      const raw = await discoverJobs(env, query, location);

      // Expand any search/listing pages into individual job links by crawling their HTML
      const crawlResults = await Promise.allSettled(
        raw.filter(item => isSearchResultsPage(item.source_url))
           .map(item => crawlForJobLinks(item.source_url, item.source_name))
      );
      const crawled = crawlResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      const discovered = [
        ...raw.filter(item => !isSearchResultsPage(item.source_url)),
        ...crawled,
      ];
      summary.discovered += discovered.length;

      for (const item of discovered) {
        if (totalProcessed >= MAX_PER_RUN) break;
        if (seenUrls.has(item.source_url)) { summary.skipped += 1; continue; }
        // Pre-filter: skip items whose title/snippet contains no niche keywords.
        // Bare URL items (no text yet) are always allowed through.
        if (!isLikelyNicheRelevant(item, nicheKeywords)) { summary.skipped += 1; continue; }
        seenUrls.add(item.source_url);
        totalProcessed += 1;
        try {
          // Prior confidence by source: Adzuna provides structured job data (high prior),
          // Brave/Google return web pages that may or may not be job listings (low prior).
          const priorConfidence = item.source_name === 'Adzuna' ? 0.75 : 0.40;
          const hints = {
            ...item,
            source_type: 'import',
            source_url: item.source_url,
            source_name: item.source_name,
            confidence: priorConfidence,
          };

          // Pass 1: fetch source page and extract JSON-LD + text in one shot.
          // Also pull structured info from URL patterns (ZipRecruiter /c/Company/Job/...).
          const { text: sourceText, ldHints } = await fetchSourcePage(item.source_url);
          const urlHints = extractUrlHints(item.source_url);
          const enrichedHints = { ...hints, ...urlHints, ...ldHints };

          // Pass 2: AI parse from full page text (or fall back to snippet if page was blocked)
          const inputText = sourceText || item.snippet || item.title || '';
          let parsed = await parseJobText(env, inputText, enrichedHints);

          const payload = {
            ...parsed,
            source_type: 'import',
            source_url: item.source_url,
            source_name: item.source_name,
            description: parsed.description || item.snippet || '',
          };

          // Drop low-confidence results and obvious junk (search results pages, sign-in walls)
          if (Number(payload.confidence || 0) < 0.35) { summary.skipped += 1; continue; }
          if (isJunkJob(payload)) { summary.skipped += 1; continue; }

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
        } catch (error) {
          summary.errors.push(error.message);
          summary.skipped += 1;
        }
      }
    }

    // Auto-publish phase: drain the entire pending queue (not just new items).
    // This means enabling auto-publish in admin settings immediately publishes
    // everything already waiting, and future scans keep the queue clear.
    if (autoPublish) {
      const { published: queuePublished, errors: queueErrors } =
        await autoPublishEligibleCandidates(env, {
          threshold: publishThreshold,
          siteUrl: options.siteUrl || '',
        });
      summary.published += queuePublished;
      summary.errors.push(...queueErrors);
    }

    await finishRun(env, runId, summary);
    return { run_id: runId, ...summary, candidates_list: allCandidates };
  } catch (error) {
    await finishRun(env, runId, summary, error.message);
    throw error;
  }
}

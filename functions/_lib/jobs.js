const ACTIVE_STATUSES = new Set(['draft', 'pending', 'active', 'expired', 'rejected']);
const EMPLOYMENT_TYPES = new Set(['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'PER_DIEM', 'INTERN', 'VOLUNTEER', 'OTHER']);
const STATE_CODES = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
};

export const JOB_COLUMNS = [
  'id',
  'slug',
  'status',
  'title',
  'company',
  'company_url',
  'city',
  'state',
  'postal_code',
  'country',
  'location_type',
  'employment_type',
  'pay_min',
  'pay_max',
  'pay_type',
  'currency',
  'description',
  'apply_url',
  'contact_email',
  'contact_phone',
  'owner_email',
  'source_url',
  'source_name',
  'source_type',
  'confidence',
  'valid_through',
  'expires_at',
  'published_at',
  'indexed_at',
  'last_edited_at',
  'created_at',
  'updated_at',
].join(', ');

function clean(value, max = 5000) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanLong(value, max = 16000) {
  if (value == null) return '';
  return String(value).trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoAddDays(isoDate, days) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function slugify(value) {
  const slug = clean(value, 180)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || crypto.randomUUID().slice(0, 8);
}

function mapEmploymentType(value) {
  const normalized = clean(value, 40).toUpperCase().replace(/[\s-]+/g, '_');
  const aliases = {
    FULLTIME: 'FULL_TIME',
    FULL_TIME: 'FULL_TIME',
    PARTTIME: 'PART_TIME',
    PART_TIME: 'PART_TIME',
    CONTRACT: 'CONTRACTOR',
    CONTRACTOR: 'CONTRACTOR',
    SALARY: 'FULL_TIME',
    HOURLY: 'FULL_TIME',
  };
  const mapped = aliases[normalized] || normalized;
  return EMPLOYMENT_TYPES.has(mapped) ? mapped : 'OTHER';
}

function displayEmploymentType(value) {
  const labels = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    CONTRACTOR: 'Contract',
    TEMPORARY: 'Temporary',
    PER_DIEM: 'Per diem',
    INTERN: 'Internship',
    VOLUNTEER: 'Volunteer',
    OTHER: 'Other',
  };
  return labels[value] || 'Other';
}

function normalizeStatus(value, fallback = 'pending') {
  const status = clean(value || fallback, 20).toLowerCase();
  return ACTIVE_STATUSES.has(status) ? status : fallback;
}

function normalizeState(value) {
  const state = clean(value, 60).toUpperCase();
  if (state.length === 2) return state;
  return STATE_CODES[state] || state.slice(0, 2);
}

const PHONE_RE = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;

function normalizeContact(input) {
  const contact = clean(input.contact || '', 1000);
  const applyUrl = clean(input.apply_url || (contact.startsWith('http') ? contact : '') || '', 1000);
  const contactEmail = clean(input.contact_email || (contact.includes('@') && !contact.startsWith('http') ? contact : ''), 320);
  const contactPhone = clean(input.contact_phone || (PHONE_RE.test(contact) && !contact.startsWith('http') && !contact.includes('@') ? contact : ''), 40);
  return { applyUrl, contactEmail, contactPhone };
}

export function normalizeJobInput(input, options = {}) {
  const now = options.now || new Date().toISOString();
  const { applyUrl, contactEmail, contactPhone } = normalizeContact(input);
  const status = normalizeStatus(input.status, options.defaultStatus || 'pending');
  const publishedAt = input.published_at || (status === 'active' ? now : null);

  return {
    id: input.id || crypto.randomUUID(),
    slug: input.slug || '',
    status,
    title: clean(input.title, 180),
    company: clean(input.company, 180),
    company_url: clean(input.company_url, 1000) || null,
    city: clean(input.city, 100),
    state: normalizeState(input.state),
    postal_code: clean(input.postal_code || input.location, 20) || null,
    country: clean(input.country, 2).toUpperCase() || 'US',
    location_type: clean(input.location_type, 40).toLowerCase() || 'onsite',
    employment_type: mapEmploymentType(input.employment_type || input.category),
    pay_min: numberOrNull(input.pay_min ?? input.payrangemin),
    pay_max: numberOrNull(input.pay_max ?? input.payrangemax),
    pay_type: clean(input.pay_type || input.paytype || 'Hourly', 40) || 'Hourly',
    currency: clean(input.currency || 'USD', 3).toUpperCase(),
    description: cleanLong(input.description || input.content, 16000),
    apply_url: applyUrl || null,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || '',
    owner_email: clean(input.owner_email, 320).toLowerCase() || contactEmail || null,
    source_url: clean(input.source_url, 1000) || null,
    source_name: clean(input.source_name, 120) || null,
    source_type: clean(input.source_type || 'manual', 40) || 'manual',
    confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 1) || 0)),
    valid_through: input.valid_through || input.expires_at || isoAddDays(now, 45),
    expires_at: input.expires_at || input.valid_through || isoAddDays(now, 45),
    published_at: publishedAt,
    indexed_at: input.indexed_at || null,
    last_edited_at: input.last_edited_at || null,
    created_at: input.created_at || input.created || now,
    updated_at: now,
  };
}

// Detect search-results pages, cookie banners, and sign-in walls masquerading as jobs.
const JUNK_TITLE_RE = /^\d[\d,+]+\s+\S.*\bjobs?\b/i;  // "37,000+ installer jobs..."
const JUNK_PHRASES = [
  'sign in', 'log in', 'cookie', 'privacy policy', 'javascript',
  'hiring now - find', 'browse \d', 'search.*jobs.*get the right',
  'join \/ sign', 'create job alert',
];
export function isJunkJob(job) {
  const t = String(job.title || '');
  if (t.length > 120) return true;
  if (/<[a-z]/i.test(t)) return true;   // HTML tags in title
  if (JUNK_TITLE_RE.test(t)) return true;
  const tl = t.toLowerCase();
  return JUNK_PHRASES.some(p => new RegExp(p, 'i').test(tl));
}

export function validateJob(job) {
  const missing = [];
  if (!job.title) missing.push('title');
  if (!job.company) missing.push('company');
  if (job.status === 'active') {
    if (!job.apply_url && !job.contact_email && !job.contact_phone) missing.push('apply_url, contact_email, or contact_phone');
  }
  return missing;
}

async function ensureUniqueSlug(env, job) {
  const base = slugify([job.title, job.company, job.city, job.state].filter(Boolean).join(' '));
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = await env.DB.prepare('SELECT id FROM jobs WHERE slug = ? AND id != ?').bind(slug, job.id).first();
    if (!existing) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

export function rowToJob(row, siteUrl = '', options = {}) {
  if (!row) return null;
  const detailPath = `/jobs/${row.slug}`;
  const job = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    company: row.company,
    company_url: row.company_url || '',
    location: row.postal_code || '',
    city: row.city || '',
    state: row.state || '',
    country: row.country || 'US',
    location_type: row.location_type || 'onsite',
    employment_type: row.employment_type || 'OTHER',
    category: displayEmploymentType(row.employment_type),
    payrangemin: row.pay_min ?? '',
    payrangemax: row.pay_max ?? '',
    paytype: row.pay_type || 'Hourly',
    pay_min: row.pay_min,
    pay_max: row.pay_max,
    pay_type: row.pay_type || 'Hourly',
    currency: row.currency || 'USD',
    content: row.description,
    description: row.description,
    apply_url: row.apply_url || '',
    contact_email: row.contact_email || '',
    contact_phone: row.contact_phone || '',
    contact: row.apply_url || row.contact_email || row.contact_phone || row.source_url || '',
    source_url: row.source_url || '',
    source_name: row.source_name || '',
    source_type: row.source_type || 'manual',
    confidence: row.confidence ?? 1,
    valid_through: row.valid_through,
    expires_at: row.expires_at,
    published_at: row.published_at,
    indexed_at: row.indexed_at,
    last_edited_at: row.last_edited_at,
    created: row.published_at || row.created_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    detail_path: detailPath,
    detail_url: siteUrl ? `${siteUrl}${detailPath}` : detailPath,
  };
  if (options.includePrivate) {
    job.owner_email = row.owner_email || '';
  }
  return job;
}

export async function getJob(env, idOrSlug, options = {}) {
  const includeInactive = options.includeInactive || false;
  const query = includeInactive
    ? `SELECT ${JOB_COLUMNS} FROM jobs WHERE id = ? OR slug = ? LIMIT 1`
    : `SELECT ${JOB_COLUMNS} FROM jobs WHERE (id = ? OR slug = ?) AND status = 'active' LIMIT 1`;
  const row = await env.DB.prepare(query).bind(idOrSlug, idOrSlug).first();
  return rowToJob(row, options.siteUrl, options);
}

export async function listJobs(env, options = {}) {
  const params = [];
  const where = [];

  if (!options.includeInactive) {
    where.push("status = 'active'");
    where.push("(expires_at IS NULL OR expires_at > ?)");
    params.push(new Date().toISOString());
  } else if (options.status && options.status !== 'all') {
    where.push('status = ?');
    params.push(options.status);
  }

  if (options.query) {
    const like = `%${options.query}%`;
    where.push('(title LIKE ? OR company LIKE ? OR city LIKE ? OR state LIKE ? OR description LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const result = await env.DB.prepare(
    `SELECT ${JOB_COLUMNS} FROM jobs ${whereSql} ORDER BY COALESCE(published_at, created_at) DESC LIMIT ?`
  ).bind(...params, limit).all();

  return (result.results || []).map(row => rowToJob(row, options.siteUrl, options));
}

export async function insertJob(env, input, options = {}) {
  const job = normalizeJobInput(input, options);
  const missing = validateJob(job);
  if (missing.length) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }

  if (job.source_url) {
    const existing = await env.DB.prepare(`SELECT ${JOB_COLUMNS} FROM jobs WHERE source_url = ? LIMIT 1`).bind(job.source_url).first();
    if (existing) return rowToJob(existing, options.siteUrl, options);
  }

  job.slug = await ensureUniqueSlug(env, job);

  await env.DB.prepare(
    `INSERT INTO jobs (
      id, slug, status, title, company, company_url, city, state, postal_code, country,
      location_type, employment_type, pay_min, pay_max, pay_type, currency, description,
      apply_url, contact_email, contact_phone, owner_email, source_url, source_name, source_type, confidence,
      valid_through, expires_at, published_at, indexed_at, last_edited_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    job.id, job.slug, job.status, job.title, job.company, job.company_url, job.city, job.state,
    job.postal_code, job.country, job.location_type, job.employment_type, job.pay_min, job.pay_max,
    job.pay_type, job.currency, job.description, job.apply_url, job.contact_email, job.contact_phone,
    job.owner_email, job.source_url, job.source_name, job.source_type, job.confidence, job.valid_through,
    job.expires_at, job.published_at, job.indexed_at, job.last_edited_at, job.created_at, job.updated_at
  ).run();

  return getJob(env, job.id, { includeInactive: true, siteUrl: options.siteUrl });
}

export async function deleteJob(env, idOrSlug) {
  const existing = await getJob(env, idOrSlug, { includeInactive: true });
  if (!existing) return null;
  await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(existing.id).run();
  return existing;
}

export async function updateJob(env, idOrSlug, input, options = {}) {
  const existing = await getJob(env, idOrSlug, { includeInactive: true, includePrivate: true, siteUrl: options.siteUrl });
  if (!existing) return null;

  const now = new Date().toISOString();
  const normalized = normalizeJobInput({
    ...existing,
    ...input,
    id: existing.id,
    slug: existing.slug,
    created_at: existing.created_at,
    published_at: input.status === 'active' && !existing.published_at
      ? now
      : input.published_at ?? existing.published_at,
  }, {
    ...options,
    defaultStatus: existing.status || 'pending',
    now,
  });
  const missing = validateJob(normalized);
  if (missing.length) {
    throw new Error(`Missing required field(s): ${missing.join(', ')}`);
  }

  await env.DB.prepare(
    `UPDATE jobs SET
      status = ?, title = ?, company = ?, company_url = ?, city = ?, state = ?,
      postal_code = ?, country = ?, location_type = ?, employment_type = ?,
      pay_min = ?, pay_max = ?, pay_type = ?, currency = ?, description = ?,
      apply_url = ?, contact_email = ?, contact_phone = ?, owner_email = ?, source_url = ?, source_name = ?,
      source_type = ?, confidence = ?, valid_through = ?, expires_at = ?,
      published_at = ?, indexed_at = ?, last_edited_at = ?, updated_at = ?
    WHERE id = ?`
  ).bind(
    normalized.status,
    normalized.title,
    normalized.company,
    normalized.company_url,
    normalized.city,
    normalized.state,
    normalized.postal_code,
    normalized.country,
    normalized.location_type,
    normalized.employment_type,
    normalized.pay_min,
    normalized.pay_max,
    normalized.pay_type,
    normalized.currency,
    normalized.description,
    normalized.apply_url,
    normalized.contact_email,
    normalized.contact_phone,
    normalized.owner_email,
    normalized.source_url,
    normalized.source_name,
    normalized.source_type,
    normalized.confidence,
    normalized.valid_through,
    normalized.expires_at,
    normalized.published_at,
    normalized.indexed_at,
    normalized.last_edited_at,
    normalized.updated_at,
    existing.id
  ).run();

  return getJob(env, existing.id, { includeInactive: true, siteUrl: options.siteUrl });
}

export async function updateJobIndexTimestamp(env, id, indexedAt = new Date().toISOString()) {
  await env.DB.prepare('UPDATE jobs SET indexed_at = ?, updated_at = ? WHERE id = ?').bind(indexedAt, indexedAt, id).run();
}

export function buildJobPostingJsonLd(job, siteUrl, siteName = 'CrimeSceneCleanerJobs') {
  const jobUrl = `${siteUrl}/jobs/${job.slug}`;
  const salaryUnit = /salary|year/i.test(job.paytype || '') ? 'YEAR' : 'HOUR';

  // Strip HTML tags for plain-text description (required by Google Jobs)
  const rawDesc = job.description || job.content || '';
  const plainDesc = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const location = [job.city, job.state].filter(Boolean).join(', ');
  // Google requires description — fall back to a generated sentence if none exists
  const descriptionText = plainDesc ||
    `${job.title} position at ${job.company}${location ? ` in ${location}` : ''}. Apply now.`;
  // Only include validThrough if it's in the future — a past validThrough tells Google
  // the job is expired and causes it to drop the listing from search results.
  const rawValidThrough = job.valid_through || job.expires_at;
  const validThroughFuture = rawValidThrough && new Date(rawValidThrough) > new Date()
    ? rawValidThrough : undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title || undefined,
    description: descriptionText || undefined,
    datePosted: job.published_at || job.created_at || undefined,
    validThrough: validThroughFuture,
    employmentType: job.employment_type || undefined,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company || undefined,
    },
    identifier: {
      '@type': 'PropertyValue',
      name: siteName,
      value: job.id,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city || undefined,
        addressRegion: job.state || undefined,
        addressCountry: job.country || 'US',
      },
    },
    url: jobUrl,
    // directApply tells Google this is a direct application link (improves Jobs visibility)
    directApply: Boolean(job.apply_url),
  };

  if (job.company_url) jsonLd.hiringOrganization.sameAs = job.company_url;
  if (job.pay_min || job.pay_max) {
    jsonLd.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: job.currency || 'USD',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.pay_min || undefined,
        maxValue: job.pay_max || job.pay_min || undefined,
        unitText: salaryUnit,
      },
    };
  }

  return JSON.parse(JSON.stringify(jsonLd));
}

export async function insertCandidate(env, candidate) {
  const now = new Date().toISOString();
  const id = candidate.id || crypto.randomUUID();
  const payload = {
    ...candidate.payload,
    title: candidate.title || candidate.payload?.title || '',
    company: candidate.company || candidate.payload?.company || '',
    city: candidate.city || candidate.payload?.city || '',
    state: candidate.state || candidate.payload?.state || '',
    source_url: candidate.source_url || candidate.payload?.source_url || '',
    source_name: candidate.source_name || candidate.payload?.source_name || '',
    confidence: candidate.confidence ?? candidate.payload?.confidence ?? 0,
  };

  if (!payload.source_url) return null;

  await env.DB.prepare(
    `INSERT OR IGNORE INTO job_import_candidates (
      id, run_id, status, source_url, source_name, title, company, city, state,
      confidence, payload_json, discovered_at
    ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    candidate.run_id || null,
    payload.source_url,
    payload.source_name || candidate.source_name || null,
    payload.title || null,
    payload.company || null,
    payload.city || null,
    payload.state || null,
    Number(payload.confidence || 0),
    JSON.stringify(payload),
    now
  ).run();

  const row = await env.DB.prepare('SELECT * FROM job_import_candidates WHERE source_url = ? LIMIT 1').bind(payload.source_url).first();
  return rowToCandidate(row);
}

export function rowToCandidate(row) {
  if (!row) return null;
  const payload = JSON.parse(row.payload_json || '{}');
  return {
    id: row.id,
    run_id: row.run_id,
    status: row.status,
    source_url: row.source_url,
    source_name: row.source_name || payload.source_name || '',
    title: row.title || payload.title || 'Untitled job',
    company: row.company || payload.company || '',
    city: row.city || payload.city || '',
    state: row.state || payload.state || '',
    confidence: row.confidence,
    discovered_at: row.discovered_at,
    reviewed_at: row.reviewed_at,
    payload,
    ...payload,
  };
}

export async function listCandidates(env, status = 'pending', limit = 50, ageDays = 30) {
  const cutoff = new Date(Date.now() - ageDays * 86400000).toISOString();
  const result = await env.DB.prepare(
    'SELECT * FROM job_import_candidates WHERE status = ? AND discovered_at >= ? ORDER BY discovered_at DESC LIMIT ?'
  ).bind(status, cutoff, limit).all();
  return (result.results || []).map(rowToCandidate);
}

export async function approveCandidate(env, id, options = {}) {
  const row = await env.DB.prepare('SELECT * FROM job_import_candidates WHERE id = ? LIMIT 1').bind(id).first();
  if (!row) throw new Error('Candidate not found.');
  const candidate = rowToCandidate(row);
  let job = await insertJob(env, {
    ...candidate.payload,
    status: 'active',
    source_type: candidate.payload.source_type || 'import',
    source_url: candidate.source_url,
  }, { ...options, defaultStatus: 'active' });
  // insertJob dedup: if source_url already existed it returns the existing job unchanged.
  // Promote it to active and extend valid_through so it gets a fresh 45-day indexing window.
  if (job && job.status !== 'active') {
    const extendedThrough = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
    job = await updateJob(env, job.id, { status: 'active', valid_through: extendedThrough, expires_at: extendedThrough }, { siteUrl: options.siteUrl }) || job;
  }
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE job_import_candidates SET status = ?, reviewed_at = ? WHERE id = ?').bind('approved', now, id).run();
  return job;
}

export async function rejectCandidate(env, id) {
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE job_import_candidates SET status = ?, reviewed_at = ? WHERE id = ?').bind('rejected', now, id).run();
}

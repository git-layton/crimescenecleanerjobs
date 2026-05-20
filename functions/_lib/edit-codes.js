import { getJob, updateJob } from './jobs.js';

const EDIT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clean(value, max = 1000) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 320).toLowerCase();
}

function getOwnerEmail(jobOrInput) {
  return normalizeEmail(jobOrInput.owner_email || jobOrInput.contact_email || '');
}

function addDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function generateEditCode() {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < bytes.length; i += 1) {
    code += EDIT_CODE_ALPHABET[bytes[i] % EDIT_CODE_ALPHABET.length];
    if (i === 3 || i === 6) code += '-';
  }
  return code;
}

function normalizeCode(code) {
  return clean(code, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashEditCode(env, jobId, code) {
  return sha256(`${env.EDIT_CODE_PEPPER || 'local-dev-pepper'}:${jobId}:${normalizeCode(code)}`);
}

async function sendEditCodeEmail(env, { to, code, job, siteUrl, expiresAt }) {
  if (!env.RESEND_API_KEY || !to) {
    return { sent: false, reason: 'Email provider is not configured.' };
  }

  const from = env.FROM_EMAIL || 'CrimeSceneCleanerJobs <no-reply@crimescenecleanerjobs.com>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Edit code for ${job.title}`,
      text: [
        `Your edit code for "${job.title}" is:`,
        '',
        code,
        '',
        `Edit here: ${siteUrl}/?edit=${encodeURIComponent(job.slug)}`,
        `This code expires ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC.`,
      ].join('\n'),
      html: `
        <p>Your edit code for <strong>${escapeHtml(job.title)}</strong> is:</p>
        <p style="font-size: 24px; letter-spacing: 2px;"><strong>${escapeHtml(code)}</strong></p>
        <p><a href="${siteUrl}/?edit=${encodeURIComponent(job.slug)}">Edit your listing</a></p>
        <p>This code expires ${escapeHtml(new Date(expiresAt).toISOString())}.</p>
      `,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = payload.message || payload.name || `Resend failed with ${response.status}`;
    console.error('[email] Resend error:', response.status, JSON.stringify(payload));
    return { sent: false, error };
  }
  return { sent: true, provider: 'resend', id: payload.id || '' };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function createEditCode(env, job, options = {}) {
  const ownerEmail = normalizeEmail(options.ownerEmail || getOwnerEmail(job));
  if (!ownerEmail) {
    return { created: false, reason: 'No owner email was provided.' };
  }

  const code = generateEditCode();
  const now = new Date().toISOString();
  const expiresAt = addDays(Number(env.EDIT_CODE_DAYS || 30));
  const tokenHash = await hashEditCode(env, job.id, code);
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO post_edit_codes (
      id, job_id, owner_email, token_hash, expires_at, last_sent_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, job.id, ownerEmail, tokenHash, expiresAt, null, now).run();

  const email = await sendEditCodeEmail(env, {
    to: ownerEmail,
    code,
    job,
    siteUrl: options.siteUrl || '',
    expiresAt,
  });

  if (email.sent) {
    await env.DB.prepare('UPDATE post_edit_codes SET last_sent_at = ? WHERE id = ?').bind(now, id).run();
  }

  return {
    created: true,
    emailed: Boolean(email.sent),
    email,
    expires_at: expiresAt,
    edit_code: email.sent && env.RETURN_EDIT_CODE_AFTER_EMAIL !== 'true' ? undefined : code,
  };
}

export async function requestEditCode(env, { idOrSlug, email, siteUrl }) {
  const normalizedEmail = normalizeEmail(email);
  const job = idOrSlug
    ? await getJob(env, idOrSlug, { includeInactive: true, includePrivate: true, siteUrl })
    : null;

  if (!job || !normalizedEmail) {
    return { ok: true, delivered: false };
  }

  const ownerEmail = getOwnerEmail(job);
  if (ownerEmail !== normalizedEmail) {
    return { ok: true, delivered: false };
  }

  const edit = await createEditCode(env, job, { ownerEmail: normalizedEmail, siteUrl });
  return {
    ok: true,
    delivered: Boolean(edit.emailed),
    edit_code: edit.edit_code,
    expires_at: edit.expires_at,
  };
}

export async function verifyEditCode(env, idOrSlug, code, options = {}) {
  const job = await getJob(env, idOrSlug, { includeInactive: true, siteUrl: options.siteUrl });
  if (!job) return null;

  const tokenHash = await hashEditCode(env, job.id, code);
  const row = await env.DB.prepare(
    `SELECT * FROM post_edit_codes
     WHERE job_id = ? AND token_hash = ? AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(job.id, tokenHash, new Date().toISOString()).first();

  if (!row) return null;
  return { job, code_id: row.id, owner_email: row.owner_email, expires_at: row.expires_at };
}

export async function updateJobWithEditCode(env, { idOrSlug, code, patch, siteUrl }) {
  const verified = await verifyEditCode(env, idOrSlug, code, { siteUrl });
  if (!verified) {
    throw new Error('Invalid or expired edit code.');
  }

  const safePatch = {
    title: patch.title,
    company: patch.company,
    company_url: patch.company_url,
    city: patch.city,
    state: patch.state,
    location: patch.location,
    postal_code: patch.postal_code,
    location_type: patch.location_type,
    category: patch.category,
    employment_type: patch.employment_type,
    payrangemin: patch.payrangemin,
    payrangemax: patch.payrangemax,
    paytype: patch.paytype,
    pay_min: patch.pay_min,
    pay_max: patch.pay_max,
    pay_type: patch.pay_type,
    content: patch.content,
    description: patch.description,
    contact: patch.contact,
    apply_url: patch.apply_url,
    contact_email: patch.contact_email,
    owner_email: verified.owner_email,
    status: 'pending',
    last_edited_at: new Date().toISOString(),
  };

  Object.keys(safePatch).forEach(key => {
    if (safePatch[key] === undefined) delete safePatch[key];
  });

  const wasActive = verified.job.status === 'active';
  const job = await updateJob(env, verified.job.id, safePatch, { siteUrl });
  await env.DB.prepare('UPDATE post_edit_codes SET used_at = ? WHERE id = ?').bind(new Date().toISOString(), verified.code_id).run();
  return { job, was_active: wasActive };
}

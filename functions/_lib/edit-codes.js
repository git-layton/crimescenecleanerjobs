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

async function hashEditCode(env, code) {
  return sha256(`${env.EDIT_CODE_PEPPER || 'local-dev-pepper'}:${normalizeCode(code)}`);
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
      subject: `🔑 Your edit code — ${job.title} | ${env.SITE_NAME || 'CrimeSceneCleanerJobs'}`,
      text: [
        `MISSION BRIEF — ${env.SITE_NAME || 'CrimeSceneCleanerJobs'}`,
        ``,
        `Your listing "${job.title}" is live.`,
        ``,
        `EDIT CODE:`,
        code,
        ``,
        `Use this code to edit your listing at any time:`,
        `${siteUrl}/?edit=${encodeURIComponent(job.slug)}`,
        ``,
        `Code expires: ${new Date(expiresAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`,
        `Keep it somewhere safe — this is your key.`,
        ``,
        `— The ${env.SITE_NAME || 'CrimeSceneCleanerJobs'} Team`,
      ].join('\n'),
      html: `
        <!doctype html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#09090b;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 20px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
                <tr><td style="background:linear-gradient(90deg,#f59e0b,#d97706);height:4px;"></td></tr>
                <tr><td style="padding:36px 40px 28px;">
                  <p style="margin:0 0 4px;color:#f59e0b;font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">Mission Brief</p>
                  <h1 style="margin:0 0 24px;color:#f4f4f5;font-size:22px;font-weight:900;letter-spacing:-0.02em;line-height:1.2;">Your listing is live.<br>Here's your edit code.</h1>
                  <p style="margin:0 0 6px;color:#a1a1aa;font-size:13px;">Listing</p>
                  <p style="margin:0 0 28px;color:#f4f4f5;font-size:15px;font-weight:700;">${escapeHtml(job.title)}</p>

                  <div style="background:#09090b;border:1px solid #3f3f46;border-radius:8px;padding:24px;margin:0 0 28px;text-align:center;">
                    <p style="margin:0 0 8px;color:#71717a;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Edit Code — Save This</p>
                    <p style="margin:0;color:#f59e0b;font-size:32px;font-weight:900;letter-spacing:0.2em;font-family:monospace;">${escapeHtml(code)}</p>
                  </div>

                  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                    <tr><td align="center">
                      <a href="${siteUrl}/?edit=${encodeURIComponent(job.slug)}" style="display:inline-block;background:#f59e0b;color:#09090b;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;padding:14px 32px;border-radius:6px;">Edit Your Listing →</a>
                    </td></tr>
                  </table>

                  <p style="margin:0;color:#52525b;font-size:12px;line-height:1.6;">This code expires <strong style="color:#71717a;">${escapeHtml(new Date(expiresAt).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', timeZone:'UTC' })) }</strong>. Store it somewhere safe — it's the only way to edit your listing without contacting us.</p>
                </td></tr>
                <tr><td style="padding:20px 40px;border-top:1px solid #27272a;">
                  <p style="margin:0;color:#3f3f46;font-size:11px;">${escapeHtml(env.SITE_NAME || 'CrimeSceneCleanerJobs')} &mdash; The premier niche job board.<br><a href="${siteUrl}" style="color:#52525b;">${siteUrl}</a></p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
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
  const tokenHash = await hashEditCode(env, code);
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
  const tokenHash = await hashEditCode(env, code);
  const now = new Date().toISOString();

  if (idOrSlug) {
    const job = await getJob(env, idOrSlug, { includeInactive: true, siteUrl: options.siteUrl });
    if (!job) return null;
    const row = await env.DB.prepare(
      `SELECT * FROM post_edit_codes WHERE job_id = ? AND token_hash = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`
    ).bind(job.id, tokenHash, now).first();
    if (!row) return null;
    return { job, code_id: row.id, owner_email: row.owner_email, expires_at: row.expires_at };
  }

  // Code-only lookup: find job_id from the code hash
  const row = await env.DB.prepare(
    `SELECT * FROM post_edit_codes WHERE token_hash = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`
  ).bind(tokenHash, now).first();
  if (!row) return null;
  const job = await getJob(env, row.job_id, { includeInactive: true, siteUrl: options.siteUrl });
  if (!job) return null;
  return { job, code_id: row.id, owner_email: row.owner_email, expires_at: row.expires_at };
}

export async function updateJobWithEditCode(env, { idOrSlug, code, patch, siteUrl }) {
  const verified = await verifyEditCode(env, idOrSlug || '', code, { siteUrl });
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
    contact_phone: patch.contact_phone,
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

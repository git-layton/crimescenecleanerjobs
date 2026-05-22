const defaultHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...defaultHeaders, ...headers },
  });
}

export function problem(status, message, details = undefined) {
  return json({ error: message, details }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function isAdminRequest(request, env) {
  const configuredToken = env.ADMIN_TOKEN;
  if (!configuredToken) return false;

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const explicit = request.headers.get('x-admin-token') || '';
  return bearer === configuredToken || explicit === configuredToken;
}

export function requireAdmin(request, env) {
  if (isAdminRequest(request, env)) return null;
  return problem(401, 'Admin token required.');
}

export function getSiteUrl(env, request) {
  const configured = env.PUBLIC_SITE_URL || env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function clampLimit(value, fallback = 100, max = 500) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function getIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
}

// Simple D1-backed rate limiter. Returns true if the request should be blocked.
export async function isRateLimited(env, key, maxRequests, windowSeconds) {
  if (!env.DB) return false;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  try {
    const row = await env.DB.prepare(
      `SELECT attempts, window_start FROM edit_code_rate_limits WHERE ip = ? LIMIT 1`
    ).bind(key).first();
    if (!row || row.window_start < windowStart) {
      await env.DB.prepare(
        `INSERT INTO edit_code_rate_limits (ip, attempts, window_start) VALUES (?, 1, ?)
         ON CONFLICT(ip) DO UPDATE SET attempts = 1, window_start = excluded.window_start`
      ).bind(key, now).run();
      return false;
    }
    if (row.attempts >= maxRequests) return true;
    await env.DB.prepare(
      `UPDATE edit_code_rate_limits SET attempts = attempts + 1 WHERE ip = ?`
    ).bind(key).run();
    return false;
  } catch {
    return false;
  }
}

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...headers,
    },
  });
}

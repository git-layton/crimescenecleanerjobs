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

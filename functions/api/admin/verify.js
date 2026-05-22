import { getIp, isAdminRequest, isRateLimited, json, problem } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (await isRateLimited(env, `rl:admin-verify:${getIp(request)}`, 10, 900)) {
    return problem(429, 'Too many attempts. Try again in 15 minutes.');
  }
  if (!isAdminRequest(request, env)) return problem(401, 'Invalid token.');
  return json({ ok: true });
}

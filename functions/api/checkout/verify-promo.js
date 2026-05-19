import { json, problem, readJson } from '../../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.PROMO_CODE) return json({ valid: false });
  const body = await readJson(request);
  const valid = body.code && body.code.trim() === env.PROMO_CODE.trim();
  return json({ valid });
}

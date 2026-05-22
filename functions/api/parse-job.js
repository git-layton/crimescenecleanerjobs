import { getIp, isRateLimited, json, problem, readJson } from '../_lib/http.js';
import { parseJobText } from '../_lib/ai.js';

function toFormJob(parsed) {
  return {
    title: parsed.title || '',
    company: parsed.company || '',
    location: parsed.postal_code || '',
    city: parsed.city || '',
    state: parsed.state || 'Select',
    payrangemin: parsed.pay_min || '',
    payrangemax: parsed.pay_max || '',
    paytype: parsed.pay_type || 'Hourly',
    category: parsed.employment_type === 'PART_TIME'
      ? 'Part-time'
      : parsed.employment_type === 'CONTRACTOR'
        ? 'Contract'
        : 'Full-time',
    content: parsed.description || '',
    contact: parsed.apply_url || parsed.contact_email || parsed.source_url || '',
    source_url: parsed.source_url || '',
    source_name: parsed.source_name || '',
    confidence: parsed.confidence || 0,
  };
}

export async function onRequestPost({ request, env }) {
  // 20 AI parses per IP per hour
  if (await isRateLimited(env, `rl:parse:${getIp(request)}`, 20, 3600)) {
    return problem(429, 'Too many requests. Try again later.');
  }

  const body = await readJson(request);
  const text = body.text || body.rawText || '';
  if (!text.trim()) return problem(400, 'Paste job text before parsing.');

  const parsed = await parseJobText(env, text, body.hints || {});
  return json({ job: toFormJob(parsed), parsed });
}

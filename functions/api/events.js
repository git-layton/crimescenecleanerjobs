import { json, problem, readJson } from '../_lib/http.js';

const ALLOWED_EVENTS = new Set([
  'submit_click',
  'payment_initiated',
  'payment_completed',
  'job_posted',
]);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const body = await readJson(request);
  const event = String(body.event || '').trim();
  if (!ALLOWED_EVENTS.has(event)) return problem(400, 'Unknown event.');

  await env.DB.prepare(
    `INSERT INTO site_events (id, event, metadata, created_at) VALUES (?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    event,
    body.metadata ? JSON.stringify(body.metadata) : null,
    new Date().toISOString(),
  ).run();

  return json({ ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const days = 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const rows = await env.DB.prepare(
    `SELECT event, COUNT(*) as count FROM site_events WHERE created_at > ? GROUP BY event ORDER BY count DESC`
  ).bind(since).all();

  return json({ days, since, events: rows.results || [] });
}

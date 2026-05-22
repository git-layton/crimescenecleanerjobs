import { json, problem, requireAdmin } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return problem(503, 'DB not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const days = 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const [viewsResult, clicksResult, scanResult] = await Promise.all([
    env.DB.prepare(
      `SELECT json_extract(metadata, '$.slug') as slug,
              json_extract(metadata, '$.title') as title,
              COUNT(*) as views
       FROM site_events
       WHERE event = 'job_view' AND created_at > ? AND metadata IS NOT NULL
       GROUP BY json_extract(metadata, '$.slug')
       ORDER BY views DESC LIMIT 10`
    ).bind(since).all(),

    env.DB.prepare(
      `SELECT json_extract(metadata, '$.slug') as slug,
              json_extract(metadata, '$.title') as title,
              COUNT(*) as clicks
       FROM site_events
       WHERE event = 'apply_click' AND created_at > ? AND metadata IS NOT NULL
       GROUP BY json_extract(metadata, '$.slug')
       ORDER BY clicks DESC LIMIT 10`
    ).bind(since).all(),

    env.DB.prepare(
      `SELECT SUM(discovered_count) as discovered,
              SUM(candidate_count) as candidates,
              SUM(published_count) as published,
              COUNT(*) as runs
       FROM import_runs WHERE started_at > ? AND status = 'complete'`
    ).bind(since).first(),
  ]);

  return json({
    days,
    since,
    top_views: viewsResult.results || [],
    top_clicks: clicksResult.results || [],
    scan: scanResult || {},
  });
}

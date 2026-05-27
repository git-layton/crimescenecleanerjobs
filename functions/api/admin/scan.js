import { json, problem, readJson, requireAdmin } from '../../_lib/http.js';
import { autoPublishEligibleCandidates, runDailyImport } from '../../_lib/agent.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await readJson(request);

  // publishQueueOnly=true: skip the expensive web scan, just drain the pending queue.
  if (body.publishQueueOnly) {
    try {
      const dbThreshold = await env.DB.prepare(
        `SELECT value FROM site_settings WHERE key = 'auto_publish_confidence_threshold' LIMIT 1`
      ).first().then(r => r?.value ?? null).catch(() => null);
      const threshold = dbThreshold !== null
        ? Number(dbThreshold)
        : Number(env.AUTO_PUBLISH_CONFIDENCE || 0.80);
      const result = await autoPublishEligibleCandidates(env, { threshold });
      return json({ published: result.published, errors: result.errors, queue_only: true });
    } catch (error) {
      return problem(500, error.message);
    }
  }

  try {
    const result = await runDailyImport(env, {
      query:       body.query    || undefined,
      location:    body.location || undefined,
      autoPublish: body.autoPublish ?? undefined, // let agent.js read from DB settings if not explicit
    });
    return json({
      ...result,
      candidates: result.candidates_list || [],
    });
  } catch (error) {
    return problem(500, error.message);
  }
}

import { json, problem, readJson, requireAdmin } from '../../_lib/http.js';
import { runDailyImport } from '../../_lib/agent.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return problem(503, 'D1 database binding DB is not configured.');
  const adminProblem = requireAdmin(request, env);
  if (adminProblem) return adminProblem;

  const body = await readJson(request);
  try {
    const result = await runDailyImport(env, {
      query: body.query || undefined,
      location: body.location || undefined,
    });
    return json({
      ...result,
      candidates: result.candidates_list || [],
    });
  } catch (error) {
    return problem(500, error.message);
  }
}

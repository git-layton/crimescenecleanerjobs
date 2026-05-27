import { runDailyImport } from '../functions/_lib/agent.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyImport(env, { trigger: 'cron' }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/health') return new Response('Not found', { status: 404 });
    const hasDatabase = Boolean(env.DB);
    return Response.json({
      ok: hasDatabase,
      service: env.SITE_NAME ? `${env.SITE_NAME}-agent` : 'niche-jobboard-agent',
      time: new Date().toISOString(),
    });
  },
};

import { runDailyImport } from '../functions/_lib/agent.js';

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyImport(env, { trigger: event.cron }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/health') return new Response('Not found', { status: 404 });
    const hasDatabase = Boolean(env.DB);
    return Response.json({
      ok: hasDatabase,
      service: 'crimescenecleanerjobs-agent',
      time: new Date().toISOString(),
    });
  },
};

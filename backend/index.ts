import { githubAuth, sessionIdentity, type GithubConfig } from './github-auth';
import { HttpError, json } from './http';
import { profilesApi } from './profiles';
import { syncApi } from './sync-api';
import { attachmentApi } from './attachment-api';
import { hermesBridge, hermesMeals } from './hermes-meals';

interface Env extends GithubConfig {
  ASSETS: { fetch(request: Request): Promise<Response> };
  CLOUD_SYNC_ENABLED?: string;
  HERMES_MEALS_ENABLED?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const api = path === '/api' || path.startsWith('/api/');
    const auth = path === '/auth' || path.startsWith('/auth/');
    if (!api && !auth) return env.ASSETS.fetch(request);
    try {
      if (auth) return await githubAuth(request, env);
      if (env.HERMES_MEALS_ENABLED === 'true' &&
          (path === '/api/hermes/claim' || path === '/api/hermes/complete')) {
        if (new URL(request.url).origin !== env.APP_ORIGIN)
          throw new HttpError(403, 'request_origin_denied');
        return await hermesBridge(request, env.DB!);
      }
      const identity = await sessionIdentity(request, env);
      const mealRoute = /^\/api\/profiles\/([a-zA-Z0-9_-]{1,80})\/hermes-meals(?:\/pair)?$/.exec(path);
      if (mealRoute && env.HERMES_MEALS_ENABLED === 'true')
        return await hermesMeals(request, env.DB!, identity.accountId, mealRoute[1], env.APP_ORIGIN!);
      const syncRoute =
        /^\/api\/profiles\/[a-zA-Z0-9_-]{1,80}\/(sync|usage|attachments)$/.exec(
          path,
        );
      if (syncRoute) {
        if (env.CLOUD_SYNC_ENABLED !== 'true')
          return json({ error: 'not_found' }, 404);
        const handler =
          syncRoute[1] === 'attachments' ? attachmentApi : syncApi;
        return await handler(
          request,
          env.DB!,
          identity.accountId,
          env.APP_ORIGIN!,
        );
      }
      if (path === '/api/profiles' || path.startsWith('/api/profiles/'))
        return await profilesApi(
          request,
          env.DB!,
          identity.accountId,
          env.APP_ORIGIN!,
        );
      if (request.method !== 'GET')
        return json({ error: 'method_not_allowed' }, 405);
      if (path === '/api/session')
        return json({
          authenticated: true,
          accountId: identity.accountId,
          syncEnabled: env.CLOUD_SYNC_ENABLED === 'true',
        });
      if (path === '/api/health') {
        const row = await env
          .DB!.prepare('SELECT 1 AS ready')
          .first<{ ready: number }>();
        return json(
          { database: row?.ready === 1 ? 'ready' : 'unavailable' },
          row?.ready === 1 ? 200 : 503,
        );
      }
      return json({ error: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.code }, error.status);
      return json({ error: 'temporarily_unavailable' }, 503);
    }
  },
};

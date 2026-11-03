import { githubAuth, sessionIdentity, type GithubConfig } from './github-auth';
import { HttpError, json } from './http';
import { profilesApi } from './profiles';

interface Env extends GithubConfig {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const api = path === '/api' || path.startsWith('/api/');
    const auth = path === '/auth' || path.startsWith('/auth/');
    if (!api && !auth) return env.ASSETS.fetch(request);
    try {
      if (auth) return await githubAuth(request, env);
      const identity = await sessionIdentity(request, env);
      if (path === '/api/profiles' || path.startsWith('/api/profiles/'))
        return await profilesApi(request, env.DB!, identity.accountId, env.APP_ORIGIN!);
      if (request.method !== 'GET')
        return json({ error: 'method_not_allowed' }, 405);
      if (path === '/api/session')
        return json({ authenticated: true, accountId: identity.accountId });
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

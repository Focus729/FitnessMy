import type { Database } from './db';
import { HttpError, json, redirect, sameOrigin } from './http';

export interface GithubConfig {
  DB?: Database;
  APP_ORIGIN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_GITHUB_ID?: string;
}
const SESSION_COOKIE = '__Host-fitnessmy_session';
const STATE_COOKIE = '__Host-fitnessmy_oauth';
const SESSION_SECONDS = 7 * 24 * 3600;
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const hashToken = async (value: string) =>
  base64url(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  );
function cookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function readCookie(request: Request, name: string): string | undefined {
  const values = (request.headers.get('Cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (values.length !== 1) return;
  const value = values[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function configured(
  config: GithubConfig,
): asserts config is Required<GithubConfig> {
  if (
    !config.DB ||
    !config.GITHUB_CLIENT_ID ||
    !config.GITHUB_CLIENT_SECRET ||
    !config.ALLOWED_GITHUB_ID ||
    !/^\d+$/.test(config.ALLOWED_GITHUB_ID)
  )
    throw new HttpError(503, 'auth_not_configured');
  try {
    const url = new URL(config.APP_ORIGIN!);
    if (url.protocol !== 'https:' || url.origin !== config.APP_ORIGIN)
      throw new Error();
  } catch {
    throw new HttpError(503, 'auth_not_configured');
  }
}

export async function sessionIdentity(
  request: Request,
  config: GithubConfig,
  now = Math.floor(Date.now() / 1000),
) {
  configured(config);
  if (new URL(request.url).origin !== config.APP_ORIGIN)
    throw new HttpError(403, 'request_origin_denied');
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) throw new HttpError(401, 'sign_in_required');
  const account = await config.DB.prepare(
    `SELECT a.id FROM sessions s JOIN accounts a ON a.id=s.account_id
    WHERE s.token_hash=? AND s.expires_at>? AND a.github_id=?`,
  )
    .bind(await hashToken(token), now, config.ALLOWED_GITHUB_ID)
    .first<{ id: string }>();
  if (!account) throw new HttpError(401, 'sign_in_required');
  return { accountId: account.id };
}

export async function githubAuth(
  request: Request,
  config: GithubConfig,
  transport: typeof fetch = fetch,
  now = Math.floor(Date.now() / 1000),
): Promise<Response> {
  configured(config);
  const url = new URL(request.url);
  if (url.origin !== config.APP_ORIGIN)
    throw new HttpError(403, 'request_origin_denied');
  if (url.pathname === '/auth/logout') {
    if (request.method !== 'POST')
      throw new HttpError(405, 'method_not_allowed');
    sameOrigin(request, config.APP_ORIGIN);
    const token = readCookie(request, SESSION_COOKIE);
    if (token)
      await config.DB.prepare('DELETE FROM sessions WHERE token_hash=?')
        .bind(await hashToken(token))
        .run();
    return json({ signedOut: true }, 200, {
      'Set-Cookie': cookie(SESSION_COOKIE, '', 0),
    });
  }
  if (request.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
  const callback = `${config.APP_ORIGIN}/auth/callback`;
  if (url.pathname === '/auth/login') {
    // Store only a short-lived hash of the network address, never the address itself.
    const bucket = await hashToken(
      `${request.headers.get('CF-Connecting-IP') ?? 'unknown'}:${Math.floor(now / 600)}`,
    );
    const limit = await config.DB.prepare(
      `INSERT INTO auth_rate_limits(bucket,requests,expires_at) VALUES(?,1,?)
      ON CONFLICT(bucket) DO UPDATE SET requests=requests+1 RETURNING requests`,
    )
      .bind(bucket, now + 1200)
      .first<{ requests: number }>();
    if (!limit || limit.requests > 10) throw new HttpError(429, 'try_later');
    const state = randomToken();
    const verifier = randomToken();
    await config.DB.batch([
      config.DB.prepare('DELETE FROM oauth_requests WHERE expires_at<=?').bind(
        now,
      ),
      config.DB.prepare(
        'DELETE FROM auth_rate_limits WHERE expires_at<=?',
      ).bind(now),
      config.DB.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
      config.DB.prepare(
        'INSERT INTO oauth_requests(state_hash,verifier,expires_at) VALUES(?,?,?)',
      ).bind(await hashToken(state), verifier, now + 600),
    ]);
    const destination = new URL('https://github.com/login/oauth/authorize');
    destination.search = new URLSearchParams({
      client_id: config.GITHUB_CLIENT_ID,
      redirect_uri: callback,
      state,
      code_challenge: await hashToken(verifier),
      code_challenge_method: 'S256',
      scope: '',
      allow_signup: 'false',
    }).toString();
    return redirect(destination.href, cookie(STATE_COOKIE, state, 600));
  }
  if (url.pathname !== '/auth/callback') throw new HttpError(404, 'not_found');
  const state = url.searchParams.get('state');
  const browserState = readCookie(request, STATE_COOKIE);
  if (!state || !browserState || state !== browserState)
    throw new HttpError(400, 'invalid_login_state');
  // Consume once before contacting GitHub: replay or parallel callbacks cannot create another session.
  const saved = await config.DB.prepare(
    'DELETE FROM oauth_requests WHERE state_hash=? AND expires_at>? RETURNING verifier',
  )
    .bind(await hashToken(state), now)
    .first<{ verifier: string }>();
  if (!saved) throw new HttpError(400, 'login_expired');
  if (url.searchParams.has('error'))
    return redirect('/?auth=cancelled', cookie(STATE_COOKIE, '', 0));
  const code = url.searchParams.get('code');
  if (!code || code.length > 512)
    throw new HttpError(400, 'invalid_login_code');
  let user: { id?: unknown };
  let providerStage = 'exchange';
  try {
    const tokenResponse = await transport(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FitnessMy',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.GITHUB_CLIENT_ID,
          client_secret: config.GITHUB_CLIENT_SECRET,
          code,
          code_verifier: saved.verifier,
          redirect_uri: callback,
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      },
    );
    providerStage = `exchange_http_${tokenResponse.status}_parse`;
    const token = (await tokenResponse.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
    };
    if (token.error) {
      const knownErrors = ['incorrect_client_credentials', 'bad_verification_code', 'redirect_uri_mismatch', 'incorrect_code_verifier'];
      throw new HttpError(503, knownErrors.includes(token.error) ? `github_${token.error}` : 'github_exchange_rejected');
    }
    if (
      !tokenResponse.ok ||
      !token.access_token ||
      token.token_type?.toLowerCase() !== 'bearer' ||
      token.scope?.trim()
    )
      throw new HttpError(503, token.scope?.trim() ? 'github_unexpected_scope' : 'github_invalid_token_response');
    providerStage = 'identity';
    const response = await transport('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'FitnessMy',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new HttpError(503, 'github_identity_rejected');
    user = (await response.json()) as { id?: unknown };
    // Provider credentials never enter D1, logs, browser cookies or profile backups.
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const kind = error instanceof Error && ['TypeError', 'SyntaxError', 'TimeoutError', 'AbortError'].includes(error.name) ? error.name.toLowerCase() : 'error';
    throw new HttpError(503, `github_${providerStage}_${kind}`);
  }
  if (
    typeof user.id !== 'number' ||
    !Number.isSafeInteger(user.id) ||
    String(user.id) !== config.ALLOWED_GITHUB_ID
  )
    throw new HttpError(403, 'access_denied');
  const accountId = `github:${user.id}`;
  const session = randomToken();
  await config.DB.batch([
    config.DB.prepare(
      'INSERT INTO accounts(id,github_id,created_at) VALUES(?,?,?) ON CONFLICT(github_id) DO NOTHING',
    ).bind(accountId, String(user.id), now),
    config.DB.prepare(
      'INSERT INTO sessions(token_hash,account_id,expires_at,created_at) VALUES(?,?,?,?)',
    ).bind(await hashToken(session), accountId, now + SESSION_SECONDS, now),
  ]);
  const response = redirect(
    '/',
    cookie(SESSION_COOKIE, session, SESSION_SECONDS),
  );
  response.headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  return response;
}

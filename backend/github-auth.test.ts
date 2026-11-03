import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DatabaseSync as SQLiteDatabase,
  SQLInputValue,
} from 'node:sqlite';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import {
  githubAuth,
  hashToken,
  sessionIdentity,
  type GithubConfig,
} from './github-auth';
import type { Database, SqlStatement, SqlResult } from './db';
import worker from './index';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
let sqlite: SQLiteDatabase;
let config: GithubConfig;
const now = 1800000000;

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(
      new URL('./migrations/0001_identity.sql', import.meta.url),
      'utf8',
    ),
  );
  const prepare = (sql: string, values: unknown[] = []): SqlStatement => ({
    bind: (...next) => prepare(sql, next),
    first: async <T>() =>
      (sqlite.prepare(sql).get(...(values as SQLInputValue[])) ??
        null) as T | null,
    all: async <T>() => ({
      success: true,
      results: sqlite.prepare(sql).all(...(values as SQLInputValue[])) as T[],
      meta: { changes: 0 },
    }),
    run: async () => ({
      success: true,
      results: [],
      meta: {
        changes: Number(
          sqlite.prepare(sql).run(...(values as SQLInputValue[])).changes,
        ),
      },
    }),
  });
  const db: Database = {
    prepare,
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const result: SqlResult[] = [];
        for (const statement of statements) result.push(await statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  config = {
    DB: db,
    APP_ORIGIN: 'https://fixture.example',
    GITHUB_CLIENT_ID: 'fixture-client',
    GITHUB_CLIENT_SECRET: 'synthetic-fixture-secret',
    ALLOWED_GITHUB_ID: '123',
  };
});
afterEach(() => sqlite.close());

const url = (path: string) => `https://fixture.example${path}`;
async function begin() {
  const response = await githubAuth(
    new Request(url('/auth/login')),
    config,
    fetch,
    now,
  );
  const location = new URL(response.headers.get('Location')!);
  const state = location.searchParams.get('state')!;
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  return { response, location, state, cookie };
}
const provider = (id = 123, scope = '') =>
  vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes('access_token')
      ? Response.json({
          access_token: 'synthetic-provider-token',
          token_type: 'bearer',
          scope,
        })
      : Response.json({ id, login: 'name-can-change' }),
  );
async function callback(id = 123) {
  const start = await begin();
  const transport = provider(id);
  const request = new Request(
    url(`/auth/callback?code=fixture-code&state=${start.state}`),
    { headers: { Cookie: start.cookie } },
  );
  const response = await githubAuth(request, config, transport, now);
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-fitnessmy_session='))!
    .split(';')[0];
  return { request, response, sessionCookie, transport };
}

describe('single-owner GitHub authentication', () => {
  it('uses PKCE, no extra scopes and an HttpOnly Secure short-lived state cookie', async () => {
    const { response, location, state } = await begin();
    expect(location.origin).toBe('https://github.com');
    expect(location.searchParams.get('scope')).toBe('');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('redirect_uri')).toBe(
      url('/auth/callback'),
    );
    const saved = sqlite.prepare('SELECT * FROM oauth_requests').get()!;
    expect(saved.state_hash).toBe(await hashToken(state));
    expect(location.searchParams.get('code_challenge')).toBe(
      await hashToken(saved.verifier as string),
    );
    expect(response.headers.get('Set-Cookie')).toContain(
      'HttpOnly; Secure; SameSite=Lax; Max-Age=600',
    );
  });
  it('creates an opaque own session without storing GitHub tokens or client secrets', async () => {
    const { sessionCookie, response } = await callback();
    expect(response.status).toBe(303);
    await expect(
      sessionIdentity(
        new Request(url('/api/session'), {
          headers: { Cookie: sessionCookie },
        }),
        config,
        now,
      ),
    ).resolves.toEqual({ accountId: 'github:123' });
    const rows = sqlite.prepare('SELECT * FROM sessions').all();
    expect(JSON.stringify(rows)).not.toMatch(
      /synthetic-provider-token|synthetic-fixture-secret/,
    );
    expect(rows[0].token_hash).not.toBe(sessionCookie.split('=')[1]);
  });
  it('rejects a different immutable GitHub ID without creating an account', async () => {
    await expect(callback(456)).rejects.toMatchObject({ status: 403 });
    expect(sqlite.prepare('SELECT * FROM accounts').all()).toHaveLength(0);
    expect(sqlite.prepare('SELECT * FROM sessions').all()).toHaveLength(0);
  });
  it('rejects missing browser binding before talking to GitHub', async () => {
    const { state } = await begin();
    const transport = provider();
    await expect(
      githubAuth(
        new Request(url(`/auth/callback?code=x&state=${state}`)),
        config,
        transport,
        now,
      ),
    ).rejects.toMatchObject({ code: 'invalid_login_state' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('allows an authorization callback only once', async () => {
    const { request, transport } = await callback();
    await expect(
      githubAuth(request, config, transport, now),
    ).rejects.toMatchObject({ code: 'login_expired' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(sqlite.prepare('SELECT * FROM sessions').all()).toHaveLength(1);
  });
  it('rejects an expired authorization flow', async () => {
    const { state, cookie } = await begin();
    await expect(
      githubAuth(
        new Request(url(`/auth/callback?code=x&state=${state}`), {
          headers: { Cookie: cookie },
        }),
        config,
        provider(),
        now + 601,
      ),
    ).rejects.toMatchObject({ code: 'login_expired' });
  });
  it('denies expired sessions and spoofed Access headers', async () => {
    const { sessionCookie } = await callback();
    await expect(
      sessionIdentity(
        new Request(url('/api/session'), {
          headers: { Cookie: sessionCookie },
        }),
        config,
        now + 7 * 86400,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      sessionIdentity(
        new Request(url('/api/session'), {
          headers: {
            'Cf-Access-Authenticated-User-Email': 'owner@example.test',
          },
        }),
        config,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('blocks cross-origin logout and revokes a valid same-origin session', async () => {
    const { sessionCookie } = await callback();
    await expect(
      githubAuth(
        new Request(url('/auth/logout'), {
          method: 'POST',
          headers: { Cookie: sessionCookie, Origin: 'https://attacker.test' },
        }),
        config,
        provider(),
        now,
      ),
    ).rejects.toMatchObject({ status: 403 });
    const response = await githubAuth(
      new Request(url('/auth/logout'), {
        method: 'POST',
        headers: { Cookie: sessionCookie, Origin: 'https://fixture.example' },
      }),
      config,
      provider(),
      now,
    );
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    await expect(
      sessionIdentity(
        new Request(url('/api/session'), {
          headers: { Cookie: sessionCookie },
        }),
        config,
        now,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('rejects provider tokens with unexpected permissions', async () => {
    const { state, cookie } = await begin();
    await expect(
      githubAuth(
        new Request(url(`/auth/callback?code=x&state=${state}`), {
          headers: { Cookie: cookie },
        }),
        config,
        provider(123, 'repo'),
        now,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(sqlite.prepare('SELECT * FROM sessions').all()).toHaveLength(0);
  });
  it('bounds unauthenticated login attempts', async () => {
    for (let i = 0; i < 10; i++) await begin();
    await expect(begin()).rejects.toMatchObject({ status: 429 });
  });
  it('never returns cached HTML for unauthenticated API/auth requests', async () => {
    const assets = vi.fn();
    for (const path of ['/api/session', '/api/unknown', '/auth/callback']) {
      const response = await worker.fetch(new Request(url(path)), {
        ...config,
        ASSETS: { fetch: assets },
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(assets).not.toHaveBeenCalled();
  });
  it('fails closed until configuration is complete', async () => {
    const response = await worker.fetch(new Request(url('/api/session')), {
      ASSETS: { fetch: vi.fn() },
    });
    expect(response.status).toBe(503);
  });
});

import { expect, it } from 'vitest';
import worker from './index';
import { hashToken } from './github-auth';
import { testDatabase } from './test-database';

it('dispatches sync routes only for an authenticated owner when explicitly enabled', async () => {
  const fixture = testDatabase();
  try {
    const token = await hashToken('synthetic-test-session');
    fixture.sql
      .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
      .run(await hashToken(token), 'a', Math.floor(Date.now() / 1000) + 60, 0);
    fixture.sql.exec(
      "INSERT INTO profiles VALUES ('b','foreign','Other','a',1,0,0)",
    );
    const origin = 'https://fixture.example';
    const env = {
      DB: fixture.db,
      ASSETS: { fetch: async () => new Response(null, { status: 502 }) },
      APP_ORIGIN: origin,
      GITHUB_CLIENT_ID: 'fixture',
      GITHUB_CLIENT_SECRET: 'fixture',
      ALLOWED_GITHUB_ID: '1',
    };
    const enabled = { ...env, CLOUD_SYNC_ENABLED: 'true' };
    const cookie = `__Host-fitnessmy_session=${token}`;
    const owned = new Request(`${origin}/api/profiles/p/sync`, {
      headers: { cookie },
    });
    expect((await worker.fetch(owned, env)).status).toBe(404);
    expect((await worker.fetch(new Request(owned.url), enabled)).status).toBe(
      401,
    );
    const response = await worker.fetch(owned, enabled);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ changes: [], done: true });
    const foreign = new Request(`${origin}/api/profiles/foreign/usage`, {
      headers: { cookie },
    });
    expect((await worker.fetch(foreign, enabled)).status).toBe(404);
    const crossOrigin = new Request(
      `${origin}/api/profiles/p/attachments?action=begin`,
      {
        method: 'POST',
        headers: { cookie, Origin: 'https://other.example' },
      },
    );
    expect((await worker.fetch(crossOrigin, enabled)).status).toBe(403);
  } finally {
    fixture.sql.close();
  }
});

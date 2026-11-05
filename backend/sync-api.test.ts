import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { syncApi } from './sync-api';
let fixture: ReturnType<typeof testDatabase>;
const origin = 'https://fixture.invalid';
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());
const call = (path: string, account = 'a', init?: RequestInit) =>
  syncApi(
    new Request(`${origin}/api/profiles/p/${path}`, init),
    fixture.db,
    account,
    origin,
  );
it('serves owned no-store snapshots and denies foreign profiles', async () => {
  const response = await call('sync?mode=snapshot');
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({
    changes: [],
    cursor: 0,
    done: true,
  });
  expect((await call('sync', 'foreign')).status).toBe(503); // Unknown identity cannot create a rate row.
  fixture.sql.exec("INSERT INTO accounts VALUES ('other','3',0)");
  expect((await call('sync', 'other')).status).toBe(404);
});
it('rejects cross-origin writes and ambiguous cursor parameters', async () => {
  expect(
    (
      await call('sync', 'a', {
        method: 'POST',
        headers: { Origin: 'https://foreign.invalid' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  for (const query of [
    'after=-1',
    'after=1&after=2',
    'mode=other',
    'limit=Infinity',
    'secret=x',
  ])
    expect((await call(`sync?${query}`)).status).toBe(400);
});
it('returns a bounded retry hint when the account budget is exhausted', async () => {
  const minute = Math.floor(Date.now() / 60000) * 60;
  fixture.sql
    .prepare("INSERT INTO sync_rate_limits VALUES ('a','read',?,120)")
    .run(minute);
  const response = await call('usage');
  expect(response.status).toBe(429);
  expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(Number(response.headers.get('Retry-After'))).toBeLessThanOrEqual(60);
});

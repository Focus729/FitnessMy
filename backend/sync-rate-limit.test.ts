import { afterEach, beforeEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { consumeSyncRequest, SYNC_REQUEST_LIMITS } from './sync-rate-limit';

let fixture: ReturnType<typeof testDatabase>;
beforeEach(() => {
  fixture = testDatabase();
});
afterEach(() => fixture.sql.close());

it('atomically admits only the configured burst and preserves profile data', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 80 }, () =>
      consumeSyncRequest(fixture.db, 'a', 'write', 121),
    ),
  );
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(SYNC_REQUEST_LIMITS.write);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    20,
  );
  await expect(
    consumeSyncRequest(fixture.db, 'a', 'write', 135),
  ).rejects.toMatchObject({ status: 429, retryAfter: 45 });
  expect(
    fixture.sql.prepare('SELECT requests FROM sync_rate_limits').get(),
  ).toMatchObject({ requests: 60 });
  expect(
    fixture.sql.prepare('SELECT count(*) AS count FROM profiles').get(),
  ).toMatchObject({ count: 2 });
});

it('reuses a bounded row on the next window and does not reset it on clock regression', async () => {
  await consumeSyncRequest(fixture.db, 'a', 'write', 120);
  await consumeSyncRequest(fixture.db, 'a', 'write', 180);
  await expect(
    consumeSyncRequest(fixture.db, 'a', 'write', 120),
  ).rejects.toMatchObject({ status: 429 });
  expect(
    fixture.sql
      .prepare('SELECT window_start,requests FROM sync_rate_limits')
      .all(),
  ).toEqual([{ window_start: 180, requests: 1 }]);
});

it('isolates accounts and operation budgets', async () => {
  for (let i = 0; i < 60; i++)
    await consumeSyncRequest(fixture.db, 'a', 'write', 120);
  await consumeSyncRequest(fixture.db, 'b', 'write', 120);
  await consumeSyncRequest(fixture.db, 'a', 'read', 120);
  await consumeSyncRequest(fixture.db, 'a', 'attachment', 120);
  expect(
    fixture.sql.prepare('SELECT count(*) AS count FROM sync_rate_limits').get(),
  ).toMatchObject({ count: 4 });
});

it('fails closed without leaking database failures', async () => {
  fixture.sql.exec('DROP TABLE sync_rate_limits');
  await expect(
    consumeSyncRequest(fixture.db, 'a', 'read', 120),
  ).rejects.toMatchObject({
    status: 503,
    message: 'sync_rate_limit_unavailable',
  });
});

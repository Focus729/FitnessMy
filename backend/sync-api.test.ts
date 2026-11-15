import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { syncApi } from './sync-api';
import { defaultSettings } from '../src/data/defaults';
import { projectCloudEntity } from '../src/data/cloud/schema';
import { FOOD_PREFERENCES_HEADER } from '../src/domain/nutrition/food-preferences';
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

it('syncs optional preferences and protects them from an older client', async () => {
  const settings = projectCloudEntity('settings', {
    ...defaultSettings(), preferredIngredientIds: ['seed-chicken-breast'],
  });
  const send = (version: string | undefined, revision: number, payload: Record<string, unknown>) =>
    call('sync', 'a', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(version ? { [FOOD_PREFERENCES_HEADER]: version } : {}),
      },
      body: JSON.stringify({
        schemaVersion: 1,
        batchId: `settings-batch-${revision}`,
        mutations: [{ operationId: `settings-op-${revision}`, type: 'settings',
          id: 'singleton', expectedRevision: revision, payload }],
      }),
    });
  expect((await send('1', 0, settings)).status).toBe(200);
  const oldPull = await call('sync');
  expect(oldPull.status).toBe(409);
  expect(await oldPull.json()).toEqual({ error: 'sync_client_update_required' });
  expect((await send(undefined, 1, projectCloudEntity('settings', defaultSettings()))).status).toBe(409);
  const response = await call('sync', 'a', { headers: { [FOOD_PREFERENCES_HEADER]: '1' } });
  expect(await response.json()).toMatchObject({ changes: [{ payload: { preferredIngredientIds: ['seed-chicken-breast'] } }] });
  const lists = { ...settings, excludedIngredientIds: ['seed-tofu-firm'] };
  expect((await send('2', 1, lists)).status).toBe(200);
  expect((await call('sync', 'a', { headers: { [FOOD_PREFERENCES_HEADER]: '1' } })).status).toBe(409);
  expect((await send('1', 2, settings)).status).toBe(409);
  const current = await call('sync', 'a', { headers: { [FOOD_PREFERENCES_HEADER]: '2' } });
  expect(await current.json()).toMatchObject({ changes: [{ payload: settings }, { payload: lists }] });
  expect((await send('2', 2, { ...lists, excludedIngredientIds: [], preferredIngredientIds: [] })).status).toBe(200);
});

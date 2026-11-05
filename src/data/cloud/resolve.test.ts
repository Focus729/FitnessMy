// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { receivePage } from './receive';
import { resolveConflict } from './resolve';
import { prepareNextBatch } from './prepare';
let db: LentaDB;
const water = (ml: number) => ({
  id: 'w',
  date: '2026-11-05',
  time: '10:00',
  ml,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
});
beforeEach(async () => {
  db = new LentaDB('resolve-fixture');
  await db.cloudState.put({
    key: 'link',
    accountId: 'a',
    profileId: 'p',
    locked: false,
  });
  await db.water.put(water(250));
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});
async function remote() {
  await receivePage(db, 'a', 'p', 0, {
    changes: [
      {
        sequence: 1,
        revision: 1,
        operationId: 'remote',
        type: 'water',
        id: 'w',
        payload: water(500),
      },
    ],
    cursor: 1,
    watermark: 1,
    done: true,
  });
  return (await db.cloudVersions.get(['water', 'w']))!;
}
it('chooses remote data and preserves a local recovery snapshot', async () => {
  const version = await remote();
  await resolveConflict(
    db,
    'a',
    'p',
    'water',
    'w',
    1,
    version.localHead,
    'remote',
  );
  expect((await db.water.get('w'))!.ml).toBe(500);
  expect(await db.cloudOutbox.count()).toBe(0);
  expect(
    (await db.cloudVersions.get(['water', 'w']))!.conflict,
  ).toBeUndefined();
  const recovery = (await db.table('cloudState').toArray()).find((row) =>
    row.key.startsWith('conflictRecovery:'),
  );
  expect(recovery.local.ml).toBe(250);
  expect(recovery.remote.payload.ml).toBe(500);
});
it('rejects an outdated choice after another local edit', async () => {
  const version = await remote();
  await db.water.update('w', { ml: 750 });
  await expect(
    resolveConflict(db, 'a', 'p', 'water', 'w', 1, version.localHead, 'remote'),
  ).rejects.toThrow('sync_conflict_changed');
  expect((await db.water.get('w'))!.ml).toBe(750);
  expect(await db.cloudOutbox.count()).toBe(2);
});
it('does not discard a request whose server outcome is unknown', async () => {
  const prepared = await prepareNextBatch(db, 'a', 'p');
  const version = await remote();
  await expect(
    resolveConflict(db, 'a', 'p', 'water', 'w', 1, version.localHead, 'remote'),
  ).rejects.toThrow('sync_request_in_flight');
  expect(await db.table('cloudState').get('push')).toEqual(prepared);
  expect(await db.cloudOutbox.count()).toBe(1);
});

// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { prepareNextBatch } from './prepare';
let db: LentaDB;
const water = (id: string) => ({
  id,
  date: '2026-11-05',
  time: '10:00',
  ml: 250,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
});
beforeEach(async () => {
  db = new LentaDB('prepare-fixture');
  await db.cloudState.put({
    key: 'link',
    accountId: 'a',
    profileId: 'p',
    locked: false,
  });
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});
it('reuses the exact persisted request after new edits and database reopening', async () => {
  await db.water.put(water('w'));
  const first = await prepareNextBatch(db, 'a', 'p');
  await db.water.update('w', { ml: 750 });
  db.close();
  db = new LentaDB('prepare-fixture');
  expect(await prepareNextBatch(db, 'a', 'p')).toEqual(first);
  expect(first!.body.mutations[0]!.payload.ml).toBe(250);
  expect(await db.cloudOutbox.count()).toBe(2);
});
it('preserves transaction grouping and refuses to silently split oversized transactions', async () => {
  await db.transaction('rw', db.water, async () => {
    await db.water.bulkPut(
      Array.from({ length: 21 }, (_, index) => water(String(index))),
    );
  });
  await expect(prepareNextBatch(db, 'a', 'p')).rejects.toThrow(
    'sync_transaction_too_large',
  );
  expect(await db.cloudOutbox.count()).toBe(21);
  expect(await db.table('cloudState').get('push')).toBeUndefined();
});
it('blocks unresolved conflicts before preparing a request', async () => {
  await db.water.put(water('w'));
  await db.cloudVersions.update(['water', 'w'], {
    conflict: { revision: 1, payload: water('w'), operationId: 'remote' },
  });
  await expect(prepareNextBatch(db, 'a', 'p')).rejects.toThrow(
    'sync_conflict_pending',
  );
});

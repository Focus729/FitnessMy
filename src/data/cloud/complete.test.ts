// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { prepareNextBatch } from './prepare';
import { completePreparedBatch } from './complete';
let db: LentaDB;
beforeEach(async () => {
  db = new LentaDB('complete-fixture');
  await db.cloudState.put({
    key: 'link',
    accountId: 'a',
    profileId: 'p',
    locked: false,
  });
  await db.water.put({
    id: 'w',
    date: '2026-11-05',
    time: '10:00',
    ml: 250,
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
  });
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});
it('advances a later edit from the acknowledged predecessor revision', async () => {
  const prepared = (await prepareNextBatch(db, 'a', 'p'))!;
  await db.water.update('w', { ml: 500 });
  const mutation = prepared.body.mutations[0]!;
  await completePreparedBatch(db, 'a', 'p', prepared.body.batchId, [
    {
      operationId: mutation.operationId,
      entityType: mutation.type,
      entityId: mutation.id,
      revision: 1,
    },
  ]);
  const next = (await prepareNextBatch(db, 'a', 'p'))!;
  expect(next.body.batchId).not.toBe(prepared.body.batchId);
  expect(next.body.mutations[0]!.expectedRevision).toBe(1);
  expect(next.body.mutations[0]!.payload.ml).toBe(500);
});
it('retains the original retry request on an incomplete server response', async () => {
  const prepared = (await prepareNextBatch(db, 'a', 'p'))!;
  await expect(
    completePreparedBatch(db, 'a', 'p', prepared.body.batchId, []),
  ).rejects.toThrow('invalid_sync_receipt');
  expect(await prepareNextBatch(db, 'a', 'p')).toEqual(prepared);
  expect(await db.cloudOutbox.count()).toBe(1);
});

// @vitest-environment node
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { acknowledgeOperations } from './acknowledge';

let db: LentaDB;
beforeEach(async () => {
  db = new LentaDB('acknowledgement-fixture');
  await db.cloudState.put({
    key: 'link',
    accountId: 'a',
    profileId: 'p',
    locked: false,
  });
  await db.water.put({
    id: 'w',
    date: '2026-11-04',
    time: '10:00',
    ml: 250,
    createdAt: '2026-11-04T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
  });
});
afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});
const receipt = (operationId: string, revision: number) => ({
  operationId,
  revision,
  entityType: 'water',
  entityId: 'w',
});

it('retains an edit made while the preceding operation was in flight', async () => {
  const first = (await db.cloudOutbox.toArray())[0]!;
  await db.water.update('w', { ml: 500 });
  const second = (await db.cloudOutbox.toArray())[1]!;
  await acknowledgeOperations(db, 'a', 'p', [receipt(first.operationId, 1)]);
  expect(await db.cloudOutbox.toArray()).toEqual([second]);
  expect((await db.water.get('w'))!.ml).toBe(500);
  expect((await db.cloudVersions.get(['water', 'w']))!.localHead).toBe(
    second.operationId,
  );
  await acknowledgeOperations(db, 'a', 'p', [receipt(second.operationId, 2)]);
  expect(await db.cloudOutbox.count()).toBe(0);
  expect(
    (await db.cloudVersions.get(['water', 'w']))!.localHead,
  ).toBeUndefined();
  await acknowledgeOperations(db, 'a', 'p', [receipt(second.operationId, 2)]);
});

it('rolls back all acknowledgements if any receipt is invalid', async () => {
  const first = (await db.cloudOutbox.toArray())[0]!;
  await expect(
    acknowledgeOperations(db, 'a', 'p', [
      receipt(first.operationId, 1),
      receipt('unknown', 2),
    ]),
  ).rejects.toThrow();
  expect(await db.cloudOutbox.count()).toBe(1);
  expect((await db.cloudVersions.get(['water', 'w']))!.serverRevision).toBe(0);
});

it('rejects a switched account and unexpected revisions without losing queued work', async () => {
  const first = (await db.cloudOutbox.toArray())[0]!;
  await expect(
    acknowledgeOperations(db, 'foreign', 'p', [receipt(first.operationId, 1)]),
  ).rejects.toThrow('cloud_workspace_changed');
  await expect(
    acknowledgeOperations(db, 'a', 'p', [receipt(first.operationId, 2)]),
  ).rejects.toThrow('sync_receipt_revision_mismatch');
  expect(await db.cloudOutbox.count()).toBe(1);
});

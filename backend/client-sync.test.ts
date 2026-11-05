import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { LentaDB } from '../src/data/db/schema';
import { syncOnce, type SyncTransport } from '../src/data/cloud/sync-once';
import { commitSyncBatch, pullSyncChanges } from './sync-store';

let fixture: ReturnType<typeof testDatabase>;
let phone: LentaDB;
let pc: LentaDB;
let transport: SyncTransport;
beforeEach(async () => {
  fixture = testDatabase();
  phone = new LentaDB('sync-phone');
  pc = new LentaDB('sync-pc');
  for (const db of [phone, pc])
    await db.cloudState.put({
      key: 'link',
      accountId: 'a',
      profileId: 'p',
      locked: false,
    });
  transport = {
    push: async (body) => ({
      batchId: body.batchId,
      changes: await commitSyncBatch(fixture.db, 'a', 'p', body),
    }),
    pull: (after, watermark) =>
      pullSyncChanges(fixture.db, 'a', 'p', after, watermark, 2),
  };
});
afterEach(async () => {
  for (const db of [phone, pc]) {
    db.close();
    await Dexie.delete(db.name);
  }
  fixture.sql.close();
});
const water = (id: string, ml = 250) => ({
  id,
  date: '2026-11-05',
  time: '10:00',
  ml,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
});
it('retains both versions after concurrent edits and pulls the conflict despite push rejection', async () => {
  await phone.water.put(water('w'));
  await syncOnce(phone, 'a', 'p', transport);
  await syncOnce(pc, 'a', 'p', transport);
  await phone.water.update('w', { ml: 400 });
  await pc.water.update('w', { ml: 600 });
  await syncOnce(phone, 'a', 'p', transport);
  await expect(syncOnce(pc, 'a', 'p', transport)).rejects.toMatchObject({ status: 409 });
  expect((await pc.water.get('w'))!.ml).toBe(600);
  expect((await pc.cloudVersions.get(['water', 'w']))!.conflict!.payload.ml).toBe(400);
  expect(await pc.cloudOutbox.count()).toBe(1);
});
it('converges two independent local databases through the real SQL protocol', async () => {
  await phone.water.put(water('w'));
  await syncOnce(phone, 'a', 'p', transport);
  await syncOnce(pc, 'a', 'p', transport);
  expect(await pc.water.get('w')).toEqual(water('w'));
  await pc.water.update('w', { ml: 500 });
  await syncOnce(pc, 'a', 'p', transport);
  await syncOnce(phone, 'a', 'p', transport);
  expect((await phone.water.get('w'))!.ml).toBe(500);
  expect(await phone.cloudOutbox.count()).toBe(0);
});
it('replays a committed request after its response is lost without duplicating data', async () => {
  await phone.water.put(water('w'));
  const dropped: SyncTransport = {
    ...transport,
    push: async (body) => {
      await transport.push(body);
      throw new Error('connection lost');
    },
  };
  await expect(syncOnce(phone, 'a', 'p', dropped)).rejects.toThrow(
    'connection lost',
  );
  expect(await phone.cloudOutbox.count()).toBe(1);
  await syncOnce(phone, 'a', 'p', transport);
  expect(await phone.cloudOutbox.count()).toBe(0);
  expect(
    fixture.sql.prepare('SELECT count(*) AS count FROM sync_changes').get(),
  ).toMatchObject({ count: 1 });
});

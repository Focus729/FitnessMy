// @vitest-environment node
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { defaultSettings } from '../defaults';
import { withoutCloudCapture } from './outbox';

const name = 'cloud-outbox-fixture';
let db: LentaDB;
const stamp = '2026-11-04T00:00:00.000Z';
const water = (id: string, ml = 250) => ({
  id,
  createdAt: stamp,
  updatedAt: stamp,
  date: '2026-11-04',
  time: '10:00',
  ml,
});
beforeEach(() => {
  db = new LentaDB(name);
});
afterEach(async () => {
  db.close();
  await Dexie.delete(name);
});
const link = () =>
  db.cloudState.put({
    key: 'link',
    accountId: 'fixture',
    profileId: 'cloud-profile',
    locked: false,
  });

describe('durable transactional outbox', () => {
  it('keeps existing local-only profiles unlinked without queue entries', async () => {
    await db.water.put(water('w1'));
    expect(await db.cloudOutbox.count()).toBe(0);
    expect(await db.cloudState.get('link')).toBeUndefined();
  });
  it('persists a write and its stable operation across reopening the database', async () => {
    await link();
    await db.water.put(water('w1'));
    const [entry] = await db.cloudOutbox.toArray();
    expect(entry).toMatchObject({
      entityType: 'water',
      entityId: 'w1',
      baseRevision: 0,
      kind: 'put',
      value: water('w1'),
    });
    db.close();
    db = new LentaDB(name);
    expect(await db.cloudOutbox.toArray()).toEqual([entry]);
    expect(await db.water.get('w1')).toEqual(water('w1'));
  });
  it('groups related writes and coalesces multiple writes to one record within a transaction', async () => {
    await link();
    await db.transaction('rw', db.water, async () => {
      await db.water.put(water('w1'));
      await db.water.update('w1', { ml: 500 });
      await db.water.put(water('w2'));
    });
    const entries = await db.cloudOutbox.toArray();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.value.ml).toBe(500);
    expect(entries[0]!.transactionId).toBe(entries[1]!.transactionId);
  });
  it('preserves ordered ancestry across separate edits without changing their original base revision', async () => {
    await link();
    await db.cloudVersions.put({
      entityType: 'water',
      entityId: 'w1',
      serverRevision: 7,
    });
    await db.water.put(water('w1'));
    await db.water.update('w1', { ml: 500 });
    const [first, second] = await db.cloudOutbox.toArray();
    expect(second!.predecessor).toBe(first!.operationId);
    expect(first!.baseRevision).toBe(7);
    expect(second!.baseRevision).toBe(7);
    expect(first!.transactionId).not.toBe(second!.transactionId);
  });
  it('does not commit a local record when writing the queue fails', async () => {
    db.use({
      stack: 'dbcore',
      name: 'SyntheticQueueFailure',
      level: 0,
      create: (down) => ({
        ...down,
        table(tableName) {
          const table = down.table(tableName);
          return tableName === 'cloudOutbox'
            ? {
                ...table,
                mutate: async () => {
                  throw new Error('queue full');
                },
              }
            : table;
        },
      }),
    });
    await link();
    await expect(db.water.put(water('w1'))).rejects.toThrow();
    expect(await db.water.count()).toBe(0);
    expect(await db.cloudOutbox.count()).toBe(0);
    expect(await db.cloudVersions.count()).toBe(0);
  });
  it('rolls back local data and queue entries if a related transaction fails', async () => {
    await link();
    await expect(
      db.transaction('rw', db.water, async () => {
        await db.water.put(water('w1'));
        throw new Error('later write failed');
      }),
    ).rejects.toThrow('later write failed');
    expect(await db.water.count()).toBe(0);
    expect(await db.cloudOutbox.count()).toBe(0);
  });
  it('excludes credentials and ignores preference-only edits', async () => {
    const settings = defaultSettings();
    await db.settings.put(settings);
    await link();
    await db.settings.update('singleton', {
      locale: settings.locale === 'ru' ? 'en' : 'ru',
      ai: { ...settings.ai, apiKey: 'fixture-secret' },
      updatedAt: '2026-11-04T01:00:00.000Z',
    });
    expect(await db.cloudOutbox.count()).toBe(0);
    await db.settings.update('singleton', {
      units: settings.units === 'metric' ? 'imperial' : 'metric',
    });
    const [entry] = await db.cloudOutbox.toArray();
    expect(JSON.stringify(entry)).not.toContain('fixture-secret');
    expect(entry!.value).not.toHaveProperty('ai');
    expect(entry!.value).not.toHaveProperty('locale');
  });
  it('captures clear/replace as final puts plus deletions for removed records', async () => {
    await db.water.bulkPut([water('keep'), water('remove')]);
    await link();
    await db.transaction('rw', db.water, async () => {
      await db.water.clear();
      await db.water.put(water('keep', 500));
    });
    const entries = await db.cloudOutbox.toArray();
    expect(entries.find((entry) => entry.entityId === 'keep')).toMatchObject({
      kind: 'put',
      value: { ml: 500 },
    });
    expect(entries.find((entry) => entry.entityId === 'remove')).toMatchObject({
      kind: 'delete',
      value: { ml: 250 },
    });
    expect(entries).toHaveLength(2);
  });
  it('does not echo remote hydration and rejects nested suppression', async () => {
    await link();
    await withoutCloudCapture(db, ['water'], () =>
      db.water.put(water('remote')),
    );
    expect(await db.cloudOutbox.count()).toBe(0);
    await db.water.put(water('local'));
    expect(await db.cloudOutbox.count()).toBe(1);
    await expect(
      db.transaction('rw', db.water, () =>
        withoutCloudCapture(db, ['water'], async () => undefined),
      ),
    ).rejects.toThrow('cloud_origin_requires_own_transaction');
  });
  it('retains attachment bytes after a queued physical deletion', async () => {
    await db.blobs.put({
      id: 'photo',
      mime: 'text/plain',
      data: new Blob(['fixture']),
      createdAt: stamp,
    });
    await link();
    await db.blobs.delete('photo');
    const [entry] = await db.cloudOutbox.toArray();
    expect(entry!.kind).toBe('delete');
    expect(await (entry!.value.data as Blob).text()).toBe('fixture');
  });
  it('blocks local edits for a locked linked workspace', async () => {
    await link();
    await db.cloudState.update('link', { locked: true });
    await expect(db.water.put(water('w1'))).rejects.toThrow(
      'cloud_workspace_locked',
    );
    expect(await db.water.count()).toBe(0);
  });
});

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { testDatabase } from './test-database';
import { LentaDB } from '../src/data/db/schema';
import { syncOnce, type SyncTransport } from '../src/data/cloud/sync-once';
import { commitSyncBatch, pullSyncChanges } from './sync-store';
import { resolveConflict } from '../src/data/cloud/resolve';
import type { FileTransport } from '../src/data/cloud/attachments';
import type { GameState } from '../src/domain/model';
import { loadCatalogRows } from '../src/data/seed/catalog-rows';
import {
  planCloudImport,
  previewCloudMigration,
} from '../src/data/cloud/migration-preview';
import { runImportStep } from '../src/data/cloud/import-step';
import {
  beginAttachment,
  putAttachmentChunk,
  finalizeAttachment,
  attachmentStatus,
  readAttachmentChunk,
} from './attachments';

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
it('resumes a planned import after a committed response is lost and the browser closes', async () => {
  const stamp = '2026-11-05T10:00:00.000Z';
  const text = JSON.stringify({
    format: 'lenta-backup',
    version: 1,
    exportedAt: stamp,
    profile: { id: 'phone-import-source', name: 'Fixture' },
    tables: {
      recipes: [
        {
          id: 'recipe',
          name: 'Fixture',
          components: [],
          yieldGrams: 100,
          servings: 1,
          photoBlobId: 'photo',
          isFavorite: false,
          useCount: 0,
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    },
    blobs: [
      {
        id: 'photo',
        mime: 'image/png',
        data: btoa('fixture bytes'),
        createdAt: stamp,
      },
    ],
  });
  const plan = await planCloudImport(
    text,
    (await previewCloudMigration(text)).fingerprint,
  );
  const profile = plan.targetProfileId;
  fixture.sql
    .prepare("INSERT INTO profiles VALUES ('a',?,'Fixture','a',1,0,0)")
    .run(profile);
  const files: FileTransport = {
    begin: (input) => beginAttachment(fixture.db, 'a', profile, input),
    put: (id, index, data) =>
      putAttachmentChunk(fixture.db, 'a', profile, id, index, data),
    finalize: (id) => finalizeAttachment(fixture.db, 'a', profile, id),
    status: (id) => attachmentStatus(fixture.db, 'a', profile, id),
    read: (id, index) =>
      readAttachmentChunk(fixture.db, 'a', profile, id, index),
  };
  let loseResponse = true;
  const sync: Pick<SyncTransport, 'push'> = {
    async push(body) {
      const changes = await commitSyncBatch(fixture.db, 'a', profile, body);
      if (loseResponse) {
        loseResponse = false;
        throw new Error('lost response');
      }
      return { batchId: body.batchId, changes };
    },
  };
  const name = 'import-workspace-fixture';
  let workspace = new LentaDB(name);
  try {
    expect(await runImportStep(workspace, 'a', plan, { sync, files })).toEqual({
      files: 1,
      batches: 0,
      done: false,
    });
    await expect(
      runImportStep(workspace, 'a', plan, { sync, files }),
    ).rejects.toThrow('lost response');
    workspace.close();
    workspace = new LentaDB(name);
    expect(await runImportStep(workspace, 'a', plan, { sync, files })).toEqual({
      files: 1,
      batches: 1,
      done: true,
    });
    const page = await pullSyncChanges(fixture.db, 'a', profile);
    expect(page.changes.map((change) => change.type)).toEqual([
      'recipes',
      'gameState',
    ]);
    expect(await workspace.cloudState.get('link')).toBeUndefined();
  } finally {
    workspace.close();
    await Dexie.delete(name);
  }
});
it('sends only the catalog override and restores defaults after clearing it', async () => {
  const defaults = [...(await loadCatalogRows()).foods.values()][0]!;
  const stamp = '2026-11-05T10:00:00.000Z';
  await phone.foods.put({
    ...defaults,
    createdAt: stamp,
    updatedAt: stamp,
    isFavorite: true,
  });
  await syncOnce(phone, 'a', 'p', transport);
  const published = await transport.pull(0);
  expect(published.changes[0]?.payload).toEqual({
    id: defaults.id,
    catalogVersion: '1',
    updatedAt: stamp,
    values: { isFavorite: true },
    removed: [],
  });
  await syncOnce(pc, 'a', 'p', transport);
  expect(await pc.foods.get(defaults.id)).toMatchObject({
    ...defaults,
    isFavorite: true,
  });
  await phone.foods.update(defaults.id, { isFavorite: false });
  await syncOnce(phone, 'a', 'p', transport);
  await syncOnce(pc, 'a', 'p', transport);
  expect(await pc.foods.get(defaults.id)).toMatchObject(defaults);
  expect(await pc.cloudOutbox.count()).toBe(0);
});
it('hydrates legacy progress and merges concurrent achievements without awarding duplicate XP', async () => {
  const date = '2026-11-05';
  const stamp = `${date}T10:00:00.000Z`;
  const state: GameState = {
    id: 'singleton',
    xp: 100,
    level: 1,
    freezes: 0,
    streaks: {},
    unlockedAchievements: [],
    updatedAt: stamp,
  };
  await phone.table('cloudState').put({
    key: 'progress',
    baselines: [
      {
        sourceProfileId: 'phone-source',
        legacyXp: 100,
        achievements: [],
        streaks: {},
      },
    ],
  });
  const sync = (db: LentaDB) =>
    syncOnce(db, 'a', 'p', transport, undefined, date);
  await phone.gameState.put(state);
  await sync(phone);
  await sync(pc);
  expect((await pc.gameState.get('singleton'))?.xp).toBe(100);
  for (const [id, db] of [
    ['phone', phone],
    ['pc', pc],
  ] as const) {
    await db.transaction('rw', db.gameState, db.xpEvents, async () => {
      await db.xpEvents.put({
        id,
        amount: 20,
        date,
        reason: 'workout',
        dedupeKey: 'workout:1',
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.gameState.update('singleton', {
        xp: 120,
        unlockedAchievements: [{ key: id, unlockedAt: stamp }],
      });
    });
  }
  await sync(phone);
  await expect(sync(pc)).rejects.toMatchObject({
    code: 'sync_revision_conflict',
  });
  const version = (await pc.cloudVersions.get(['gameState', 'singleton']))!;
  await resolveConflict(
    pc,
    'a',
    'p',
    'gameState',
    'singleton',
    version.conflict!.revision,
    version.localHead,
    'merge',
    date,
  );
  await sync(pc);
  await sync(phone);
  for (const db of [phone, pc]) {
    const progress = (await db.gameState.get('singleton'))!;
    expect(progress.xp).toBe(120);
    expect(
      progress.unlockedAchievements.map((item) => item.key).sort(),
    ).toEqual(['pc', 'phone']);
    expect(await db.cloudOutbox.count()).toBe(0);
  }
});
it('publishes a recipe only after its attachment and hydrates both on the other device', async () => {
  const files: FileTransport = {
    begin: (input) => beginAttachment(fixture.db, 'a', 'p', input),
    put: (id, index, data) =>
      putAttachmentChunk(fixture.db, 'a', 'p', id, index, data),
    finalize: (id) => finalizeAttachment(fixture.db, 'a', 'p', id),
    status: (id) => attachmentStatus(fixture.db, 'a', 'p', id),
    read: (id, index) => readAttachmentChunk(fixture.db, 'a', 'p', id, index),
  };
  const stamp = '2026-11-05T10:00:00.000Z';
  await phone.transaction('rw', phone.blobs, phone.recipes, async () => {
    await phone.blobs.put({
      id: 'photo',
      mime: 'image/png',
      createdAt: stamp,
      data: new Blob(['photo bytes']),
    });
    await phone.recipes.put({
      id: 'recipe',
      name: 'Fixture',
      components: [],
      yieldGrams: 100,
      servings: 1,
      photoBlobId: 'photo',
      isFavorite: false,
      useCount: 0,
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
  await syncOnce(phone, 'a', 'p', transport, files);
  await syncOnce(pc, 'a', 'p', transport, files);
  expect((await pc.recipes.get('recipe'))!.photoBlobId).toBe('photo');
  expect(await (await pc.blobs.get('photo'))!.data.text()).toBe('photo bytes');
  expect(await pc.cloudOutbox.count()).toBe(0);
  expect(await phone.cloudOutbox.count()).toBe(0);
});
it('retains both versions after concurrent edits and pulls the conflict despite push rejection', async () => {
  await phone.water.put(water('w'));
  await syncOnce(phone, 'a', 'p', transport);
  await syncOnce(pc, 'a', 'p', transport);
  await phone.water.update('w', { ml: 400 });
  await pc.water.update('w', { ml: 600 });
  await syncOnce(phone, 'a', 'p', transport);
  await expect(syncOnce(pc, 'a', 'p', transport)).rejects.toMatchObject({
    status: 409,
  });
  expect((await pc.water.get('w'))!.ml).toBe(600);
  expect(
    (await pc.cloudVersions.get(['water', 'w']))!.conflict!.payload.ml,
  ).toBe(400);
  expect(await pc.cloudOutbox.count()).toBe(1);
  const version = (await pc.cloudVersions.get(['water', 'w']))!;
  await resolveConflict(
    pc,
    'a',
    'p',
    'water',
    'w',
    version.conflict!.revision,
    version.localHead,
    'local',
  );
  await syncOnce(pc, 'a', 'p', transport);
  await syncOnce(phone, 'a', 'p', transport);
  expect((await phone.water.get('w'))!.ml).toBe(600);
  expect(await pc.cloudOutbox.count()).toBe(0);
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
it('keeps a related transaction above twenty records atomic and paginates it to the other device', async () => {
  await phone.transaction('rw', phone.water, async () => {
    await phone.water.bulkPut(
      Array.from({ length: 40 }, (_, index) => water(`water-${index}`)),
    );
  });
  await syncOnce(phone, 'a', 'p', transport);
  await syncOnce(pc, 'a', 'p', transport);
  expect(await pc.water.count()).toBe(40);
  expect(await phone.cloudOutbox.count()).toBe(0);
  expect(
    fixture.sql.prepare('SELECT count(*) AS count FROM sync_receipts').get(),
  ).toMatchObject({ count: 1 });
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

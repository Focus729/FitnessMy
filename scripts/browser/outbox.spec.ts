import { expect, test } from '@playwright/test';

test('native catalog initialization is atomic and excluded from the outbox', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const schemaPath = '/src/data/db/schema.ts';
    const repoPath = '/src/data/repositories/dexie.ts';
    const seedPath = '/src/data/seed/load.ts';
    const { openDb, deleteDb } = await import(schemaPath);
    const { createRepositories } = await import(repoPath);
    const { loadSeedData } = await import(seedPath);
    const id = 'native-seed-fixture';
    const db = openDb(id);
    try {
      await db.cloudState.put({
        key: 'link',
        accountId: 'fixture',
        profileId: id,
        locked: false,
      });
      const repos = createRepositories(id);
      const results = await Promise.all([
        loadSeedData(repos, id),
        loadSeedData(repos, id),
      ]);
      const countBefore = await db.cloudOutbox.count();
      const food = await db.foods.toCollection().first();
      await db.foods.update(food.id, { isFavorite: true });
      return {
        initializations: results.filter((result) => result.foods > 0).length,
        countBefore,
        countAfter: await db.cloudOutbox.count(),
      };
    } finally {
      await deleteDb(id);
    }
  });
  expect(result).toEqual({ initializations: 1, countBefore: 0, countAfter: 1 });
});

test('native IndexedDB retains atomic mutations and attachment bytes across reload', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/data/db/schema.ts';
    const { LentaDB } = await import(modulePath);
    const db = new LentaDB('native-outbox-fixture');
    const stamp = '2026-11-04T00:00:00.000Z';
    await db.cloudState.put({
      key: 'link',
      accountId: 'fixture',
      profileId: 'fixture',
      locked: false,
    });
    await db.transaction('rw', db.water, db.blobs, async () => {
      await db.water.put({
        id: 'water',
        date: '2026-11-04',
        time: '10:00',
        ml: 250,
        createdAt: stamp,
        updatedAt: stamp,
      });
      await db.water.update('water', { ml: 500 });
      await db.blobs.put({
        id: 'image',
        mime: 'image/png',
        createdAt: stamp,
        data: new Blob(['fixture'], { type: 'image/png' }),
      });
    });
    try {
      await db.transaction('rw', db.water, async () => {
        await db.water.update('water', { ml: 999 });
        throw new Error('fixture rollback');
      });
    } catch {
      /* Expected transaction rollback. */
    }
    db.close();
  });
  await page.reload();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/data/db/schema.ts';
    const { LentaDB } = await import(modulePath);
    const db = new LentaDB('native-outbox-fixture');
    try {
      const entries = await db.cloudOutbox.toArray();
      return {
        ml: (await db.water.get('water')).ml,
        count: entries.length,
        transactionCount: new Set(
          entries.map(
            (entry: { transactionId: string }) => entry.transactionId,
          ),
        ).size,
        capturedMl: entries.find(
          (entry: { entityType: string }) => entry.entityType === 'water',
        ).value.ml,
        bytes: await entries
          .find((entry: { entityType: string }) => entry.entityType === 'blobs')
          .value.data.text(),
      };
    } finally {
      await db.delete();
    }
  });
  expect(result).toEqual({
    ml: 500,
    count: 2,
    transactionCount: 1,
    capturedMl: 500,
    bytes: 'fixture',
  });
});

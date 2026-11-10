// @vitest-environment node
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDb, dbNameFor } from '../db/schema';
import { createRepositories } from '../repositories/dexie';
import { loadSeedData } from './load';
import { loadCatalogRows } from './catalog-rows';

let profileId: string;
beforeEach(() => {
  profileId = `seed-cloud-fixture-${crypto.randomUUID()}`;
});
afterEach(async () => {
  openDb(profileId).close();
  await Dexie.delete(dbNameFor(profileId));
});

it('preserves an override hydrated before the first seed run', async () => {
  const db = openDb(profileId);
  const repos = createRepositories(profileId);
  const defaults = [...(await loadCatalogRows()).foods.values()][0]!;
  const stamp = '2026-11-05T10:00:00.000Z';
  await db.foods.put({
    ...defaults,
    createdAt: stamp,
    updatedAt: stamp,
    isFavorite: true,
  });
  await loadSeedData(repos, profileId);
  expect(await db.foods.get(defaults.id)).toMatchObject({
    isFavorite: true,
    createdAt: stamp,
  });
  expect(await db.foods.count()).toBe((await loadCatalogRows()).foods.size);
});

it('initializes the catalog once without enqueuing it and captures subsequent favorites', async () => {
  const db = openDb(profileId);
  const repos = createRepositories(profileId);
  await db.cloudState.put({
    key: 'link',
    accountId: 'fixture',
    profileId,
    locked: false,
  });
  const results = await Promise.all([
    loadSeedData(repos, profileId),
    loadSeedData(repos, profileId),
  ]);
  expect(results.filter((result) => result.foods > 0)).toHaveLength(1);
  expect(await db.foods.count()).toBeGreaterThan(0);
  expect(await db.exercises.count()).toBeGreaterThan(0);
  expect(await db.cloudOutbox.count()).toBe(0);
  const first = await db.foods.toCollection().first();
  await db.foods.update(first!.id, { isFavorite: true });
  expect(await db.cloudOutbox.count()).toBe(1);
  await loadSeedData(repos, profileId);
  expect((await db.foods.get(first!.id))!.isFavorite).toBe(true);
});

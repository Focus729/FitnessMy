// @vitest-environment node
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { openDb, dbNameFor } from '../db/schema';
import { createRepositories } from '../repositories/dexie';
import { loadSeedData } from './load';

const profileId = 'seed-cloud-fixture';
afterEach(async () => {
  openDb(profileId).close();
  await Dexie.delete(dbNameFor(profileId));
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

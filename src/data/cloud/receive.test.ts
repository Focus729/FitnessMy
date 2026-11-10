// @vitest-environment node
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LentaDB } from '../db/schema';
import { receivePage } from './receive';
let db: LentaDB;
it('derives XP and level in the same transaction without echoing game state', async () => {
  await db.table('cloudState').put({
    key: 'progress',
    baselines: [
      {
        sourceProfileId: 'phone',
        legacyXp: 100,
        achievements: [],
        streaks: {},
      },
    ],
  });
  const payload = {
    id: 'xp',
    date: '2026-11-05',
    reason: 'workoutFinished',
    amount: 30,
    dedupeKey: 'workout:1',
    createdAt: '2026-11-05T10:00:00.000Z',
    updatedAt: '2026-11-05T10:00:00.000Z',
  };
  await receivePage(
    db,
    'a',
    'p',
    0,
    {
      changes: [
        {
          sequence: 1,
          revision: 1,
          operationId: 'remote',
          type: 'xpEvents',
          id: 'xp',
          payload,
        },
      ],
      cursor: 1,
      watermark: 1,
      done: true,
    },
    [],
    '2026-11-05',
  );
  expect((await db.gameState.get('singleton'))!.xp).toBe(130);
  expect(await db.cloudOutbox.count()).toBe(0);
  expect(await db.table('cloudState').get('pull')).toMatchObject({ cursor: 1 });
});
it('rolls back rows and cursor when legacy progress metadata conflicts', async () => {
  await db.table('cloudState').put({
    key: 'progress',
    baselines: [
      {
        sourceProfileId: 'phone',
        legacyXp: 100,
        achievements: [],
        streaks: {},
      },
      {
        sourceProfileId: 'phone',
        legacyXp: 200,
        achievements: [],
        streaks: {},
      },
    ],
  });
  await expect(
    receivePage(db, 'a', 'p', 0, page(), [], '2026-11-05'),
  ).rejects.toThrow('progress_baseline_conflict');
  expect(await db.water.count()).toBe(0);
  expect(await db.table('cloudState').get('pull')).toBeUndefined();
});
it('rolls back applied data when persisting the cursor fails', async () => {
  db.close();
  db = new LentaDB('receive-fixture');
  db.use({
    stack: 'dbcore',
    name: 'FailedCheckpoint',
    level: 0,
    create: (down) => ({
      ...down,
      table(name) {
        const table = down.table(name);
        return name === 'cloudState'
          ? {
              ...table,
              mutate: (request) => {
                if (
                  (request.type === 'put' || request.type === 'add') &&
                  request.values.some((value) => value.key === 'pull')
                )
                  throw new Error('checkpoint unavailable');
                return table.mutate(request);
              },
            }
          : table;
      },
    }),
  });
  await expect(receivePage(db, 'a', 'p', 0, page())).rejects.toThrow();
  expect(await db.water.count()).toBe(0);
  expect(await db.cloudVersions.count()).toBe(0);
  expect(await db.table('cloudState').get('pull')).toBeUndefined();
});
const water = (ml: number) => ({
  id: 'w',
  date: '2026-11-05',
  time: '10:00',
  ml,
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
});
const page = (operationId = 'remote') => ({
  changes: [
    {
      sequence: 1,
      operationId,
      type: 'water',
      id: 'w',
      revision: 1,
      payload: water(500),
    },
  ],
  cursor: 1,
  watermark: 1,
  done: true,
});
beforeEach(async () => {
  db = new LentaDB('receive-fixture');
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
it('applies data and checkpoint without echoing into the outbox', async () => {
  await receivePage(db, 'a', 'p', 0, page());
  expect((await db.water.get('w'))!.ml).toBe(500);
  expect(await db.cloudOutbox.count()).toBe(0);
  expect(await db.table('cloudState').get('pull')).toMatchObject({ cursor: 1 });
});
it('rebuilds workout totals after a set arrives on a later page and after deletion', async () => {
  const stamp = '2026-11-05T10:00:00.000Z';
  const base = { createdAt: stamp, updatedAt: stamp };
  const workout = {
    ...base,
    id: 'workout',
    date: '2026-11-05',
    startedAt: stamp,
    finishedAt: stamp,
    name: 'Fixture',
    exerciseOrder: ['exercise'],
    totalSets: 9,
    totalVolumeKg: 999,
  };
  const set = {
    ...base,
    id: 'set',
    workoutId: 'workout',
    exerciseId: 'exercise',
    order: 0,
    weightKg: 40,
    reps: 10,
    type: 'normal',
    isCompleted: true,
    estimated1RM: 53.3,
  };
  await receivePage(db, 'a', 'p', 0, {
    changes: [
      {
        sequence: 1,
        revision: 1,
        operationId: 'w',
        type: 'workouts',
        id: 'workout',
        payload: workout,
      },
    ],
    cursor: 1,
    watermark: 2,
    done: false,
  });
  await receivePage(db, 'a', 'p', 1, {
    changes: [
      {
        sequence: 2,
        revision: 1,
        operationId: 's',
        type: 'workoutSets',
        id: 'set',
        payload: set,
      },
    ],
    cursor: 2,
    watermark: 2,
    done: true,
  });
  expect(await db.workouts.get('workout')).toMatchObject({
    totalSets: 1,
    totalVolumeKg: 400,
  });
  await receivePage(db, 'a', 'p', 2, {
    changes: [
      {
        sequence: 3,
        revision: 2,
        operationId: 'd',
        type: 'workoutSets',
        id: 'set',
        payload: { ...set, deletedAt: stamp },
      },
    ],
    cursor: 3,
    watermark: 3,
    done: true,
  });
  expect(await db.workouts.get('workout')).toMatchObject({
    totalSets: 0,
    totalVolumeKg: 0,
  });
  expect(await db.cloudOutbox.count()).toBe(0);
});
it('retains divergent local and remote versions instead of overwriting', async () => {
  await db.water.put(water(250));
  await receivePage(db, 'a', 'p', 0, page());
  expect((await db.water.get('w'))!.ml).toBe(250);
  expect(
    (await db.cloudVersions.get(['water', 'w']))!.conflict!.payload.ml,
  ).toBe(500);
  expect(await db.cloudOutbox.count()).toBe(1);
});
it('does not treat its own pending echo as a conflict or erase a newer edit', async () => {
  await db.water.put(water(250));
  const first = (await db.cloudOutbox.toArray())[0]!;
  await db.water.update('w', { ml: 750 });
  await receivePage(db, 'a', 'p', 0, page(first.operationId));
  expect((await db.water.get('w'))!.ml).toBe(750);
  expect(
    (await db.cloudVersions.get(['water', 'w']))!.conflict,
  ).toBeUndefined();
});
it('rejects stale cursors and foreign accounts', async () => {
  await receivePage(db, 'a', 'p', 0, page());
  await expect(receivePage(db, 'a', 'p', 0, page())).rejects.toThrow(
    'sync_cursor_changed',
  );
  await expect(
    receivePage(db, 'b', 'p', 1, {
      changes: [],
      cursor: 1,
      watermark: 1,
      done: true,
    }),
  ).rejects.toThrow('cloud_workspace_changed');
});

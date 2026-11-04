/**
 * Проверка миграции схемы v1 → v2 (доработка 0.7).
 *
 * Определение готовности требует: существующая база пользователя после
 * обновления открывается без потери данных. Тест создаёт базу ровно так, как
 * её создавала версия 1, затем открывает её кодом версии 2 и убеждается, что
 * записи на месте, а новые поля проставлены.
 */
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { LentaDB } from './schema';

const DB_NAME = 'lenta_migration_test';

/** Схема ровно из версии 1 — копия, чтобы тест не зависел от текущего кода. */
const V1_STORES = {
  profile: 'id',
  settings: 'id',
  foods:
    'id, name, searchKey, barcode, source, isFavorite, useCount, lastUsedAt',
  dishes: 'id, name, isFavorite, useCount',
  recipes: 'id, name',
  diary: 'id, date, [date+mealSlotId], refId, createdAt',
  water: 'id, date',
  fasting: 'id, startAt',
  substances: 'id, date, kind',
  mealPlans: 'id, weekStart',
  shoppingLists: 'id, mealPlanId',
  dayTemplates: 'id, name',
  exercises:
    'id, name, searchKey, category, equipment, isFavorite, *primaryMuscles',
  routines: 'id, name, source',
  workouts: 'id, date, routineId, startedAt, finishedAt',
  workoutSets:
    'id, workoutId, exerciseId, [exerciseId+order], [workoutId+order]',
  cardio: 'id, date, kind',
  body: 'id, date',
  sleep: 'id, date',
  checkins: 'id, date',
  habits: 'id, order, archived',
  habitLogs: 'id, [habitId+date], date, habitId',
  gameState: 'id',
  xpEvents: 'id, date, dedupeKey',
  blobs: 'id',
  meta: 'key',
};

const TS = '2026-07-01T10:00:00.000Z';

async function seedV1(): Promise<void> {
  const db = new Dexie(DB_NAME);
  db.version(1).stores(V1_STORES);
  await db.open();

  await db.table('workouts').put({
    id: 'w1',
    date: '2026-07-01',
    startedAt: TS,
    finishedAt: TS,
    name: 'Старая тренировка',
    totalVolumeKg: 1200,
    totalSets: 3,
    exerciseOrder: ['squat'],
    createdAt: TS,
    updatedAt: TS,
  });

  await db.table('habits').put({
    id: 'h1',
    name: 'Зарядка',
    icon: '●',
    schedule: { type: 'daily' },
    archived: false,
    order: 0,
    createdAt: TS,
    updatedAt: TS,
  });

  await db.table('habitLogs').bulkPut([
    {
      id: 'l1',
      habitId: 'h1',
      date: '2026-07-01',
      completed: true,
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'l2',
      habitId: 'h1',
      date: '2026-07-02',
      completed: false,
      createdAt: TS,
      updatedAt: TS,
    },
  ]);

  db.close();
}

describe('database schema upgrades to v3', () => {
  beforeEach(async () => {
    await Dexie.delete(DB_NAME);
  });

  it('данные версии 1 сохраняются и открываются кодом версии 2', async () => {
    await seedV1();

    const db = new LentaDB(DB_NAME);
    await db.open();

    expect(db.verno).toBe(3);

    const workout = await db.workouts.get('w1');
    expect(workout?.name).toBe('Старая тренировка');
    expect(workout?.totalVolumeKg).toBe(1200);

    db.close();
    await Dexie.delete(DB_NAME);
  });

  it('привычкам проставляется polarity, логам — outcome', async () => {
    await seedV1();

    const db = new LentaDB(DB_NAME);
    await db.open();

    const habit = await db.habits.get('h1');
    expect(habit?.polarity).toBe('build');

    const done = await db.habitLogs.get('l1');
    const missed = await db.habitLogs.get('l2');
    expect(done?.outcome).toBe('success');
    // Невыполненный день исходом не помечается: он относится к build-привычке.
    expect(missed?.outcome).toBeUndefined();

    db.close();
    await Dexie.delete(DB_NAME);
  });

  it('новая таблица планов создаётся пустой', async () => {
    await seedV1();

    const db = new LentaDB(DB_NAME);
    await db.open();

    expect(await db.plannedWorkouts.count()).toBe(0);
    // И принимает записи после миграции
    await db.plannedWorkouts.put({
      id: 'p1',
      plannedDate: '2026-08-05',
      name: 'План',
      items: [],
      status: 'planned',
      createdAt: TS,
      updatedAt: TS,
    });
    expect(await db.plannedWorkouts.count()).toBe(1);

    db.close();
    await Dexie.delete(DB_NAME);
  });

  it('opens a fresh database at version 3', async () => {
    const db = new LentaDB(`${DB_NAME}_fresh`);
    await db.open();
    expect(db.verno).toBe(3);
    db.close();
    await Dexie.delete(`${DB_NAME}_fresh`);
  });

  it('preserves v2 records without implicitly linking or uploading them', async () => {
    const previous = new Dexie(DB_NAME);
    previous.version(2).stores({
      ...V1_STORES,
      workouts: 'id, date, routineId, startedAt, finishedAt, deletedAt',
      plannedWorkouts:
        'id, plannedDate, status, routineId, [status+plannedDate]',
    });
    const record = {
      id: 'water-old',
      date: '2026-07-01',
      time: '10:00',
      ml: 250,
      createdAt: TS,
      updatedAt: TS,
    };
    await previous.table('water').put(record);
    previous.close();
    const db = new LentaDB(DB_NAME);
    try {
      await db.open();
      expect(db.verno).toBe(3);
      expect(await db.water.get(record.id)).toEqual(record);
      expect(await db.cloudState.count()).toBe(0);
      expect(await db.cloudOutbox.count()).toBe(0);
      await db.cloudState.put({
        key: 'link',
        accountId: 'fixture',
        profileId: 'fixture-profile',
        locked: false,
      });
      await db.water.update(record.id, { ml: 500 });
      expect(await db.cloudOutbox.toArray()).toEqual([
        expect.objectContaining({
          entityId: record.id,
          value: { ...record, ml: 500 },
        }),
      ]);
    } finally {
      db.close();
    }
  });
});

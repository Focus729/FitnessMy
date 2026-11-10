/**
 * Загрузка встроенных наборов в IndexedDB при первом запуске (7.1, 7.2).
 *
 * Наборы подтягиваются динамическим import() — они лежат отдельными чанками и
 * НЕ блокируют первый рендер (требование 19.2 и 7.1).
 */
import type { Exercise, Food } from '@/domain/model';
import type { Repositories } from '@/data/repositories/types';
import { nowIso } from '@/lib/date';
import { openDb } from '@/data/db/schema';
import { withoutCloudCapture } from '@/data/cloud/outbox';
import { loadCatalogRows } from './catalog-rows';
import { SEED_VERSION } from './version';

const SEED_VERSION_KEY = 'seedVersion';

/** Уже загружали наборы в эту базу? */
export async function isSeeded(repos: Repositories): Promise<boolean> {
  return (await repos.meta.get<number>(SEED_VERSION_KEY)) === SEED_VERSION;
}

export async function loadSeedData(
  repos: Repositories,
  profileId: string,
): Promise<{ foods: number; exercises: number }> {
  if (await isSeeded(repos)) return { foods: 0, exercises: 0 };

  const ts = nowIso();

  const catalog = await loadCatalogRows();
  const foods: Food[] = [...catalog.foods.values()].map((row) => ({
    ...row,
    createdAt: ts,
    updatedAt: ts,
  }));
  const exercises: Exercise[] = [...catalog.exercises.values()].map((row) => ({
    ...row,
    createdAt: ts,
    updatedAt: ts,
  }));

  return withoutCloudCapture(
    openDb(profileId),
    ['foods', 'exercises', 'meta'],
    async () => {
      // Recheck under the write lock: another tab may have completed initialization.
      if (await isSeeded(repos)) return { foods: 0, exercises: 0 };
      const db = openDb(profileId);
      // Cloud hydration may have applied an override before the first app launch.
      const [existingFoods, existingExercises] = await Promise.all([
        db.foods.bulkGet(foods.map((row) => row.id)),
        db.exercises.bulkGet(exercises.map((row) => row.id)),
      ]);
      const newFoods = foods.filter((_, index) => !existingFoods[index]);
      const newExercises = exercises.filter(
        (_, index) => !existingExercises[index],
      );
      await repos.foods.bulkPut(newFoods);
      await repos.exercises.bulkPut(newExercises);
      await repos.meta.set(SEED_VERSION_KEY, SEED_VERSION);
      return { foods: newFoods.length, exercises: newExercises.length };
    },
  );
}

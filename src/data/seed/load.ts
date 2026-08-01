/**
 * Загрузка встроенных наборов в IndexedDB при первом запуске (7.1, 7.2).
 *
 * Наборы подтягиваются динамическим import() — они лежат отдельными чанками и
 * НЕ блокируют первый рендер (требование 19.2 и 7.1).
 */
import type { Exercise, Food, Nutrients, Serving } from '@/domain/model';
import type { Repositories } from '@/data/repositories/types';
import { nowIso } from '@/lib/date';

const SEED_VERSION_KEY = 'seedVersion';
const SEED_VERSION = 1;

interface SeedFood {
  id: string;
  name: string;
  nameI18n: { ru: string; en: string };
  per100: Nutrients;
  servings: Serving[];
  basis: 'mass' | 'volume';
  category: string;
  searchKey: string;
}

interface SeedExercise {
  id: string;
  name: string;
  nameI18n: { ru: string; en: string };
  primaryMuscles: Exercise['primaryMuscles'];
  secondaryMuscles: Exercise['secondaryMuscles'];
  equipment: Exercise['equipment'];
  mechanic?: 'compound' | 'isolation';
  category: Exercise['category'];
  instructions: string[];
  imageIds: string[];
  bodyPart: 'upper' | 'lower';
  defaultRestSec: number;
  barWeightKg?: number;
  searchKey: string;
}

/** Уже загружали наборы в эту базу? */
export async function isSeeded(repos: Repositories): Promise<boolean> {
  return (await repos.meta.get<number>(SEED_VERSION_KEY)) === SEED_VERSION;
}

export async function loadSeedData(repos: Repositories): Promise<{ foods: number; exercises: number }> {
  if (await isSeeded(repos)) return { foods: 0, exercises: 0 };

  const ts = nowIso();

  const [{ default: foodRows }, { default: exerciseRows }] = await Promise.all([
    import('./foods.json') as Promise<{ default: SeedFood[] }>,
    import('./exercises.json') as Promise<{ default: SeedExercise[] }>,
  ]);

  const foods: Food[] = foodRows.map((row) => ({
    ...row,
    source: 'seed',
    isFavorite: false,
    useCount: 0,
    verified: true,
    createdAt: ts,
    updatedAt: ts,
  }));

  const exercises: Exercise[] = exerciseRows.map((row) => ({
    ...row,
    source: 'seed',
    isCustom: false,
    isFavorite: false,
    createdAt: ts,
    updatedAt: ts,
  }));

  await repos.foods.bulkPut(foods);
  await repos.exercises.bulkPut(exercises);
  await repos.meta.set(SEED_VERSION_KEY, SEED_VERSION);

  return { foods: foods.length, exercises: exercises.length };
}

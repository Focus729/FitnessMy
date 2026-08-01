/**
 * Схема Dexie — раздел 6.5.
 *
 * Одна база на профиль, имя `lenta_p_<profileId>` (правило 5.4).
 * Ни один компонент интерфейса не обращается сюда напрямую — только через
 * репозитории (правило 2.9, проверяется ESLint).
 */
import Dexie, { type Table } from 'dexie';
import type {
  BlobRecord,
  BodyMetric,
  CardioSession,
  DailyCheckin,
  DayTemplate,
  DiaryEntry,
  Dish,
  Exercise,
  FastingSession,
  Food,
  GameState,
  Habit,
  HabitLog,
  MealPlan,
  MetaRecord,
  Profile,
  Recipe,
  Routine,
  Settings,
  ShoppingList,
  SleepLog,
  SubstanceEntry,
  WaterEntry,
  Workout,
  WorkoutSet,
  XpEvent,
} from '@/domain/model';

export class LentaDB extends Dexie {
  profile!: Table<Profile, string>;
  settings!: Table<Settings, string>;
  foods!: Table<Food, string>;
  dishes!: Table<Dish, string>;
  recipes!: Table<Recipe, string>;
  diary!: Table<DiaryEntry, string>;
  water!: Table<WaterEntry, string>;
  fasting!: Table<FastingSession, string>;
  substances!: Table<SubstanceEntry, string>;
  mealPlans!: Table<MealPlan, string>;
  shoppingLists!: Table<ShoppingList, string>;
  dayTemplates!: Table<DayTemplate, string>;
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  workouts!: Table<Workout, string>;
  workoutSets!: Table<WorkoutSet, string>;
  cardio!: Table<CardioSession, string>;
  body!: Table<BodyMetric, string>;
  sleep!: Table<SleepLog, string>;
  checkins!: Table<DailyCheckin, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  gameState!: Table<GameState, string>;
  xpEvents!: Table<XpEvent, string>;
  blobs!: Table<BlobRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      profile: 'id',
      settings: 'id',
      foods: 'id, name, searchKey, barcode, source, isFavorite, useCount, lastUsedAt',
      dishes: 'id, name, isFavorite, useCount',
      recipes: 'id, name',
      diary: 'id, date, [date+mealSlotId], refId, createdAt',
      water: 'id, date',
      fasting: 'id, startAt',
      substances: 'id, date, kind',
      mealPlans: 'id, weekStart',
      shoppingLists: 'id, mealPlanId',
      dayTemplates: 'id, name',
      exercises: 'id, name, searchKey, category, equipment, isFavorite, *primaryMuscles',
      routines: 'id, name, source',
      workouts: 'id, date, routineId, startedAt, finishedAt',
      // [exerciseId+order] — критичный индекс: на нём построена автоподстановка (6.5)
      workoutSets: 'id, workoutId, exerciseId, [exerciseId+order], [workoutId+order]',
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
    });
  }
}

/** Порядок таблиц для экспорта и импорта (16.2). */
export const EXPORTABLE_TABLES = [
  'profile',
  'settings',
  'foods',
  'dishes',
  'recipes',
  'diary',
  'water',
  'fasting',
  'substances',
  'mealPlans',
  'shoppingLists',
  'dayTemplates',
  'exercises',
  'routines',
  'workouts',
  'workoutSets',
  'cardio',
  'body',
  'sleep',
  'checkins',
  'habits',
  'habitLogs',
  'gameState',
  'xpEvents',
  'meta',
] as const;

export type ExportableTable = (typeof EXPORTABLE_TABLES)[number];

export function dbNameFor(profileId: string): string {
  return `lenta_p_${profileId}`;
}

const instances = new Map<string, LentaDB>();

/** Одна открытая база на профиль за сеанс. */
export function openDb(profileId: string): LentaDB {
  const name = dbNameFor(profileId);
  let db = instances.get(name);
  if (!db) {
    db = new LentaDB(name);
    instances.set(name, db);
  }
  return db;
}

export async function deleteDb(profileId: string): Promise<void> {
  const name = dbNameFor(profileId);
  const db = instances.get(name);
  if (db) {
    db.close();
    instances.delete(name);
  }
  await Dexie.delete(name);
}

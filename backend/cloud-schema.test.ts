import { describe, expect, it } from 'vitest';
import {
  CLOUD_ENTITY_TYPES,
  projectCloudEntity,
  validateCloudEntity,
  validateCloudMutation,
} from '../src/data/cloud/schema';

const stamp = '2026-11-03T10:00:00.000Z';
const base = { id: 'fixture:1', createdAt: stamp, updatedAt: stamp };
const nutrients = { kcal: 100, proteinG: 10, fatG: 4, carbG: 6 };
const diary = {
  time: '10:00',
  mealSlotId: 'breakfast',
  kind: 'food',
  refId: 'food:1',
  nutrients,
  grams: 100,
  inputMethod: 'search',
  servingId: 'serving:1',
  servingCount: 2,
};
const item = {
  id: 'item:1',
  exerciseId: 'exercise:1',
  order: 0,
  targetSets: 3,
  targetRepsMin: 6,
  targetRepsMax: 8,
  restSec: 90,
  targetRpe: 8,
  supersetGroup: 'A',
};
const records = {
  profile: {
    name: 'Fixture',
    sex: 'male',
    birthDate: '1990-01-01',
    heightCm: 180,
    activityLevel: 1.375,
    goal: 'maintain',
    goalRatePerWeekKg: 0,
    bodyFatPct: 18,
  },
  foods: {
    source: 'user',
    name: 'Fixture food',
    per100: nutrients,
    servings: [
      { id: 'serving:1', name: 'Portion', grams: 50, isDefault: true },
    ],
    basis: 'mass',
    isFavorite: true,
    useCount: 1,
    verified: false,
    searchKey: 'fixture',
    nameI18n: { ru: 'Продукт', en: 'Food' },
    lastUsedAt: stamp,
    lastGrams: 100,
  },
  dishes: {
    name: 'Dish',
    components: [{ foodId: 'food:1', grams: 100 }],
    totalGrams: 100,
    isFavorite: true,
    useCount: 2,
    lastGrams: 50,
  },
  recipes: {
    name: 'Recipe',
    components: [{ foodId: 'food:1', grams: 100 }],
    yieldGrams: 80,
    servings: 2,
    steps: ['Cook'],
    photoBlobId: 'blob:1',
    isFavorite: true,
    useCount: 1,
  },
  diary: { ...diary, date: '2026-11-03' },
  water: { date: '2026-11-03', time: '10:00', ml: 250 },
  fasting: { startAt: stamp, targetHours: 16 },
  substances: {
    date: '2026-11-03',
    time: '10:00',
    kind: 'caffeine',
    amount: 80,
    label: 'Coffee',
    kcal: 2,
  },
  mealPlans: {
    weekStart: '2026-11-02',
    days: [
      {
        date: '2026-11-03',
        slots: [
          {
            mealSlotId: 'breakfast',
            kind: 'food',
            refId: 'food:1',
            grams: 100,
            pinned: true,
          },
        ],
      },
    ],
  },
  shoppingLists: {
    mealPlanId: 'plan:1',
    items: [{ name: 'Food', grams: 100, category: 'Other', checked: true }],
  },
  dayTemplates: { name: 'Template', entries: [diary] },
  exercises: {
    source: 'user',
    name: 'Press',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    equipment: 'barbell',
    category: 'strength',
    mechanic: 'compound',
    instructions: ['Press'],
    imageIds: ['image:1'],
    isCustom: true,
    isFavorite: true,
    defaultRestSec: 90,
    barWeightKg: 20,
    bodyPart: 'upper',
    searchKey: 'press',
  },
  routines: {
    name: 'Routine',
    source: 'user',
    days: [{ id: 'day:1', name: 'A', order: 0, items: [item] }],
    notes: 'Keep',
    nextDayIndex: 0,
    archived: false,
  },
  workouts: {
    date: '2026-11-03',
    startedAt: stamp,
    name: 'Workout',
    totalVolumeKg: 120,
    totalSets: 1,
    exerciseOrder: ['exercise:1'],
    routineId: 'routine:1',
    routineDayId: 'day:1',
    feelRating: 4,
  },
  workoutSets: {
    workoutId: 'workout:1',
    exerciseId: 'exercise:1',
    order: 0,
    weightKg: 20,
    reps: 6,
    rpe: 8,
    type: 'normal',
    isCompleted: true,
    estimated1RM: 24,
    restTakenSec: 90,
    note: 'Keep',
  },
  cardio: {
    date: '2026-11-03',
    time: '10:00',
    kind: 'walk',
    durationSec: 900,
    distanceM: 1000,
    avgHr: 100,
  },
  plannedWorkouts: {
    plannedDate: '2026-11-03',
    name: 'Plan',
    items: [{ ...item, targetWeightKg: 20 }],
    status: 'started',
    workoutId: 'workout:1',
  },
  body: {
    date: '2026-11-03',
    weightKg: 80,
    measurements: { waist: 80 },
    note: 'Keep',
  },
  sleep: {
    date: '2026-11-03',
    bedAt: '23:00',
    wakeAt: '07:00',
    durationMin: 480,
    quality: 4,
  },
  checkins: {
    date: '2026-11-03',
    mood: 4,
    energy: 4,
    stress: 2,
    soreness: 3,
    steps: 8000,
  },
  habits: {
    name: 'Habit',
    icon: 'star',
    schedule: { type: 'weekdays', days: [1, 3, 5] },
    archived: false,
    order: 0,
    polarity: 'quit',
    quitStartDate: '2026-11-01',
    targetValue: 1,
    unit: 'day',
  },
  habitLogs: {
    habitId: 'habit:1',
    date: '2026-11-03',
    completed: false,
    outcome: 'relapse',
    relapseCount: 1,
    relapseNote: 'Keep',
    usedFreeze: false,
    value: 1,
  },
  xpEvents: {
    date: '2026-11-03',
    reason: 'workout',
    amount: 10,
    dedupeKey: 'workout:1',
  },
};
const settings = {
  id: 'singleton',
  updatedAt: stamp,
  units: 'imperial',
  firstDayOfWeek: 1,
  mealSlots: [
    {
      id: 'breakfast',
      name: 'Breakfast',
      order: 0,
      defaultTime: '08:30',
      targetKcalShare: 0.3,
    },
  ],
  targets: {
    mode: 'calculated',
    kcal: 2000,
    proteinG: 130,
    fatG: 65,
    carbG: 220,
    fiberG: 28,
    sugarMaxG: 50,
    sodiumMaxMg: 2000,
    waterMl: 2400,
    basedOnWeightKg: 80,
    calculated: { kcal: 2000, proteinG: 130, fatG: 65, carbG: 220 },
  },
  gamificationEnabled: true,
  showSteps: true,
  showSleep: true,
  fasting: { enabled: true, windowHours: 16, startHour: 20 },
  waterPresetsMl: [250, 500],
  addFoodTabs: ['search', 'quick'],
  plates: { availableKg: [5, 10], barKg: 20 },
};

describe('cloud serialization boundary', () => {
  it.each(Object.entries(records))(
    'preserves %s including optional fields and tombstones',
    (type, fields) => {
      const record = { ...base, ...fields, deletedAt: stamp };
      expect(() => validateCloudEntity(type, record)).not.toThrow();
      expect(projectCloudEntity(type as keyof typeof records, record)).toEqual(
        record,
      );
      expect(() =>
        validateCloudEntity(type, { ...record, accountId: 'injected' }),
      ).toThrow('invalid_cloud_entity');
    },
  );
  it('accounts for each enabled entity type explicitly', () => {
    expect([...Object.keys(records), 'settings'].sort()).toEqual(
      [...CLOUD_ENTITY_TYPES].sort(),
    );
  });
  it('excludes device settings and secrets without changing the source', () => {
    const local = {
      ...settings,
      locale: 'ru',
      theme: 'dark',
      onboardingDone: true,
      restTimer: { defaultSec: 90, sound: true, vibrate: false },
      ai: { apiKey: 'fixture-secret', model: 'fixture' },
      sync: { gdriveClientId: 'fixture-private' },
    };
    const projected = projectCloudEntity('settings', local);
    expect(projected).toEqual(settings);
    expect(local.ai.apiKey).toBe('fixture-secret');
    expect(() => validateCloudEntity('settings', local)).toThrow(
      'invalid_cloud_entity',
    );
    (projected.targets as Record<string, unknown>).kcal = 1000;
    expect(local.targets.kcal).toBe(2000);
  });
  it('excludes the local PIN but rejects unclassified profile fields', () => {
    const profile = { ...base, ...records.profile };
    expect(
      projectCloudEntity('profile', { ...profile, pinHash: 'fixture-pin' }),
    ).toEqual(profile);
    expect(() =>
      projectCloudEntity('profile', { ...profile, futureField: 'keep me' }),
    ).toThrow();
  });
  it('rejects secrets and unknown keys at nested boundaries', () => {
    expect(() =>
      validateCloudEntity('settings', {
        ...settings,
        targets: { ...settings.targets, apiKey: 'fixture-secret' },
      }),
    ).toThrow('invalid_cloud_entity');
    expect(() =>
      validateCloudEntity('habits', {
        ...base,
        ...records.habits,
        schedule: { type: 'daily', apiKey: 'fixture-secret' },
      }),
    ).toThrow();
    expect(() =>
      validateCloudEntity('foods', {
        ...base,
        ...records.foods,
        servings: [
          { id: 'serving:1', name: 'Test', grams: 50, token: 'fixture-secret' },
        ],
      }),
    ).toThrow();
  });
  it('rejects unsupported stores, invalid calendar dates, non-finite values and oversized UTF-8 payloads', () => {
    for (const type of ['meta', 'blobs', 'gameState', '__proto__'])
      expect(() => validateCloudEntity(type, base)).toThrow();
    expect(() =>
      validateCloudEntity('water', {
        ...base,
        ...records.water,
        date: '2026-02-30',
      }),
    ).toThrow();
    expect(() =>
      validateCloudEntity('water', { ...base, ...records.water, ml: Infinity }),
    ).toThrow();
    expect(() =>
      validateCloudEntity('recipes', {
        ...base,
        ...records.recipes,
        steps: Array.from({ length: 10 }, () => 'Ж'.repeat(4000)),
      }),
    ).toThrow();
  });
  it('requires matching IDs, safe revisions and server-derived ownership', () => {
    const mutation = {
      operationId: 'op:1',
      type: 'water',
      id: base.id,
      expectedRevision: 0,
      payload: { ...base, ...records.water },
    };
    expect(() => validateCloudMutation(mutation)).not.toThrow();
    for (const changed of [
      { id: 'other' },
      { expectedRevision: -1 },
      { expectedRevision: 0.5 },
      { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { accountId: 'foreign' },
    ])
      expect(() =>
        validateCloudMutation({ ...mutation, ...changed }),
      ).toThrow();
  });
});

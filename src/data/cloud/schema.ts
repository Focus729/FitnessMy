/** Shared, dependency-free cloud boundary. Backup validation is intentionally separate. */
type Rule = (value: unknown) => boolean;
type Fields = Record<string, Rule>;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text: Rule = (v) => typeof v === 'string' && v.length <= 16000;
const id: Rule = (v) =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 200 &&
  !Array.from(v).some((character) => character.charCodeAt(0) < 32);
const number: Rule = (v) => typeof v === 'number' && Number.isFinite(v);
const nonnegative: Rule = (v) => number(v) && (v as number) >= 0;
const positive: Rule = (v) => number(v) && (v as number) > 0;
const integer: Rule = (v) => nonnegative(v) && Number.isSafeInteger(v);
const bool: Rule = (v) => typeof v === 'boolean';
const one =
  (...values: unknown[]): Rule =>
  (v) =>
    values.includes(v);
const opt =
  (rule: Rule): Rule =>
  (v) =>
    v === undefined || rule(v);
const list =
  (rule: Rule): Rule =>
  (v) =>
    Array.isArray(v) && v.length <= 2000 && v.every(rule);
const shape =
  (fields: Fields): Rule =>
  (v) =>
    object(v) &&
    Object.keys(v).every((key) => Object.hasOwn(fields, key)) &&
    Object.entries(fields).every(([key, rule]) => rule(v[key]));
const date: Rule = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const time: Rule = (v) =>
  typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const stamp: Rule = (v) =>
  typeof v === 'string' &&
  v.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  Number.isFinite(Date.parse(v));
const rating = one(1, 2, 3, 4, 5);
const base = { id, createdAt: stamp, updatedAt: stamp, deletedAt: opt(stamp) };
const nutrients = shape({
  kcal: nonnegative,
  proteinG: nonnegative,
  fatG: nonnegative,
  carbG: nonnegative,
  fiberG: opt(nonnegative),
  sugarG: opt(nonnegative),
  sodiumMg: opt(nonnegative),
  satFatG: opt(nonnegative),
});
const component = shape({ foodId: id, grams: positive });
const nameI18n = opt(shape({ ru: opt(text), en: opt(text) }));
const routineItem: Fields = {
  id,
  exerciseId: id,
  order: integer,
  supersetGroup: opt(text),
  targetSets: positive,
  targetRepsMin: nonnegative,
  targetRepsMax: nonnegative,
  targetRpe: opt(nonnegative),
  restSec: nonnegative,
};
const diary: Fields = {
  time,
  mealSlotId: id,
  kind: one('food', 'dish', 'recipe', 'quick'),
  refId: opt(id),
  quickName: opt(text),
  grams: opt(positive),
  servingId: opt(id),
  servingCount: opt(positive),
  nutrients,
  inputMethod: one(
    'search',
    'barcode',
    'quick',
    'photo',
    'text',
    'repeat',
    'plan',
  ),
  aiGenerated: opt(bool),
  aiConfidence: opt(one('low', 'medium', 'high')),
  novaGroup: opt(one(1, 2, 3, 4)),
};
const schedule: Rule = (v) =>
  object(v) &&
  (shape({ type: one('daily') })(v) ||
    shape({ type: one('weekdays'), days: list(one(1, 2, 3, 4, 5, 6, 7)) })(v) ||
    shape({ type: one('timesPerWeek'), times: one(1, 2, 3, 4, 5, 6, 7) })(v) ||
    shape({ type: one('everyNDays'), n: (n) => integer(n) && positive(n) })(v));
const measurements = shape(
  Object.fromEntries(
    [
      'neck',
      'chest',
      'waist',
      'hips',
      'thighL',
      'thighR',
      'armL',
      'armR',
      'calfL',
      'calfR',
    ].map((key) => [key, opt(nonnegative)]),
  ),
);
const muscle = one(
  'chest',
  'back',
  'lats',
  'traps',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'obliques',
  'lowerBack',
  'neck',
  'fullBody',
);
const entityFields = {
  profile: {
    name: text,
    sex: one('male', 'female'),
    birthDate: date,
    heightCm: positive,
    activityLevel: one(1.2, 1.375, 1.55, 1.725, 1.9),
    goal: one('lose', 'maintain', 'gain'),
    goalRatePerWeekKg: number,
    bodyFatPct: opt(nonnegative),
  },
  foods: {
    source: one('seed', 'off', 'usda', 'user', 'ai'),
    externalId: opt(id),
    name: id,
    nameI18n,
    brand: opt(text),
    barcode: opt(text),
    per100: nutrients,
    servings: list(
      shape({ id, name: text, grams: positive, isDefault: opt(bool) }),
    ),
    basis: one('mass', 'volume'),
    novaGroup: opt(one(1, 2, 3, 4)),
    isFavorite: bool,
    useCount: nonnegative,
    lastUsedAt: opt(stamp),
    lastGrams: opt(positive),
    verified: bool,
    category: opt(text),
    searchKey: text,
  },
  dishes: {
    name: id,
    components: list(component),
    totalGrams: nonnegative,
    isFavorite: bool,
    useCount: nonnegative,
    lastUsedAt: opt(stamp),
    lastGrams: opt(positive),
  },
  recipes: {
    name: id,
    components: list(component),
    yieldGrams: positive,
    servings: positive,
    steps: opt(list(text)),
    photoBlobId: opt(id),
    isFavorite: bool,
    useCount: nonnegative,
  },
  diary: { ...diary, date },
  water: { date, time, ml: positive },
  fasting: { startAt: stamp, endAt: opt(stamp), targetHours: positive },
  substances: {
    date,
    time,
    kind: one('alcohol', 'caffeine'),
    amount: nonnegative,
    label: text,
    kcal: opt(nonnegative),
  },
  mealPlans: {
    weekStart: date,
    days: list(
      shape({
        date,
        slots: list(
          shape({
            mealSlotId: id,
            kind: one('dish', 'recipe', 'food'),
            refId: id,
            grams: positive,
            pinned: opt(bool),
          }),
        ),
      }),
    ),
  },
  shoppingLists: {
    mealPlanId: opt(id),
    items: list(
      shape({ name: text, grams: nonnegative, category: text, checked: bool }),
    ),
  },
  dayTemplates: { name: id, entries: list(shape(diary)) },
  exercises: {
    source: one('seed', 'user'),
    name: id,
    nameI18n,
    primaryMuscles: list(muscle),
    secondaryMuscles: list(muscle),
    equipment: one(
      'barbell',
      'dumbbell',
      'machine',
      'cable',
      'bodyweight',
      'kettlebell',
      'band',
      'smith',
      'ezBar',
      'other',
    ),
    mechanic: opt(one('compound', 'isolation')),
    category: one('strength', 'cardio', 'stretching', 'plyometrics'),
    instructions: list(text),
    imageIds: list(id),
    isCustom: bool,
    isFavorite: bool,
    defaultRestSec: opt(nonnegative),
    barWeightKg: opt(nonnegative),
    bodyPart: opt(one('upper', 'lower')),
    searchKey: text,
  },
  routines: {
    name: id,
    source: one('template', 'user'),
    templateKey: opt(id),
    days: list(
      shape({
        id,
        name: text,
        order: integer,
        items: list(shape(routineItem)),
      }),
    ),
    notes: opt(text),
    nextDayIndex: opt(integer),
    archived: opt(bool),
  },
  workouts: {
    date,
    startedAt: stamp,
    finishedAt: opt(stamp),
    routineId: opt(id),
    routineDayId: opt(id),
    name: text,
    notes: opt(text),
    feelRating: opt(rating),
    totalVolumeKg: nonnegative,
    totalSets: integer,
    exerciseOrder: list(id),
  },
  workoutSets: {
    workoutId: id,
    exerciseId: id,
    order: integer,
    supersetGroup: opt(text),
    weightKg: nonnegative,
    reps: nonnegative,
    rpe: opt(nonnegative),
    type: one('normal', 'warmup', 'drop', 'failure'),
    isCompleted: bool,
    restTakenSec: opt(nonnegative),
    note: opt(text),
    estimated1RM: nonnegative,
  },
  cardio: {
    date,
    time,
    kind: one('run', 'walk', 'bike', 'swim', 'row', 'elliptical', 'other'),
    durationSec: positive,
    distanceM: opt(nonnegative),
    avgHr: opt(nonnegative),
    kcal: opt(nonnegative),
    note: opt(text),
  },
  plannedWorkouts: {
    plannedDate: date,
    routineId: opt(id),
    routineDayId: opt(id),
    name: text,
    items: list(shape({ ...routineItem, targetWeightKg: opt(nonnegative) })),
    notes: opt(text),
    status: one('planned', 'started', 'completed', 'skipped'),
    workoutId: opt(id),
  },
  body: {
    date,
    weightKg: opt(positive),
    measurements: opt(measurements),
    note: opt(text),
  },
  sleep: {
    date,
    bedAt: time,
    wakeAt: time,
    durationMin: nonnegative,
    quality: rating,
    note: opt(text),
  },
  checkins: {
    date,
    mood: rating,
    energy: rating,
    stress: rating,
    soreness: rating,
    steps: opt(nonnegative),
    note: opt(text),
  },
  habits: {
    name: id,
    icon: text,
    schedule,
    targetValue: opt(number),
    unit: opt(text),
    archived: bool,
    order: integer,
    polarity: one('build', 'quit'),
    quitStartDate: opt(date),
  },
  habitLogs: {
    habitId: id,
    date,
    value: opt(number),
    completed: bool,
    usedFreeze: opt(bool),
    outcome: opt(one('success', 'relapse')),
    relapseNote: opt(text),
    relapseCount: opt(nonnegative),
  },
  xpEvents: { date, reason: id, amount: integer, dedupeKey: id },
} satisfies Record<string, Fields>;

const settingsFields: Fields = {
  id: one('singleton'),
  updatedAt: stamp,
  units: one('metric', 'imperial'),
  firstDayOfWeek: one(1, 7),
  mealSlots: list(
    shape({
      id,
      name: text,
      order: integer,
      defaultTime: opt(time),
      targetKcalShare: opt(nonnegative),
    }),
  ),
  targets: shape({
    mode: one('calculated', 'manual'),
    kcal: positive,
    proteinG: nonnegative,
    fatG: nonnegative,
    carbG: nonnegative,
    fiberG: nonnegative,
    sugarMaxG: nonnegative,
    sodiumMaxMg: nonnegative,
    waterMl: positive,
    basedOnWeightKg: opt(positive),
    calculated: opt(
      shape({
        kcal: positive,
        proteinG: nonnegative,
        fatG: nonnegative,
        carbG: nonnegative,
      }),
    ),
  }),
  gamificationEnabled: bool,
  showSteps: bool,
  showSleep: bool,
  fasting: shape({
    enabled: bool,
    windowHours: positive,
    startHour: nonnegative,
  }),
  waterPresetsMl: list(positive),
  addFoodTabs: list(
    one(
      'frequent',
      'search',
      'barcode',
      'quick',
      'dishes',
      'recipes',
      'copyDay',
      'photoAi',
      'textAi',
    ),
  ),
  plates: shape({ availableKg: list(positive), barKg: nonnegative }),
};

const streaks: Rule = (value) =>
  object(value) &&
  Object.keys(value).length <= 2000 &&
  Object.entries(value).every(
    ([key, item]) =>
      id(key) &&
      shape({
        current: integer,
        best: integer,
        lastDate: (v) => v === '' || date(v),
      })(item),
  );
const achievements = list(shape({ key: id, unlockedAt: stamp }));
const progressFields: Fields = {
  id: one('singleton'),
  updatedAt: stamp,
  baselines: list(
    shape({
      sourceProfileId: id,
      legacyXp: integer,
      achievements,
      streaks,
    }),
  ),
  unlockedAchievements: achievements,
  streaks,
};

export type CloudEntityType =
  keyof typeof entityFields | 'settings' | 'gameState';
export const CLOUD_ENTITY_TYPES: readonly CloudEntityType[] = [
  ...(Object.keys(entityFields) as (keyof typeof entityFields)[]),
  'settings',
  'gameState',
];
export const MAX_ENTITY_BYTES = 64 * 1024;
export class CloudValidationError extends Error {
  constructor() {
    super('invalid_cloud_entity');
  }
}

/** No values or field names are included in errors, logs or rejected receipts. */
export function validateCloudEntity(
  type: string,
  value: unknown,
): asserts value is Record<string, unknown> {
  const fields =
    type === 'settings'
      ? settingsFields
      : type === 'gameState'
        ? progressFields
        : Object.hasOwn(entityFields, type)
          ? { ...base, ...entityFields[type as keyof typeof entityFields] }
          : null;
  if (!fields || !shape(fields)(value)) throw new CloudValidationError();
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new CloudValidationError();
  }
  if (new TextEncoder().encode(encoded).length > MAX_ENTITY_BYTES)
    throw new CloudValidationError();
}

/** Remove only explicitly classified local fields; unknown fields fail instead of disappearing. */
export function projectCloudEntity(
  type: CloudEntityType,
  value: unknown,
): Record<string, unknown> {
  if (!object(value)) throw new CloudValidationError();
  const projected = { ...value };
  const local =
    type === 'settings'
      ? ['ai', 'sync', 'locale', 'theme', 'restTimer', 'onboardingDone']
      : type === 'profile'
        ? ['pinHash']
        : [];
  for (const key of local) delete projected[key];
  validateCloudEntity(type, projected);
  // Return an independent plain JSON value so later edits cannot mutate a queued operation.
  return JSON.parse(JSON.stringify(projected)) as Record<string, unknown>;
}

/** Versioned input contract; identity/ownership always comes from the server session. */
export interface CloudMutation {
  operationId: string;
  type: CloudEntityType;
  id: string;
  expectedRevision: number;
  payload: Record<string, unknown>;
}
export function validateCloudMutation(
  value: unknown,
): asserts value is CloudMutation {
  if (
    !shape({
      operationId: id,
      type: one(...CLOUD_ENTITY_TYPES),
      id,
      expectedRevision: (v) =>
        integer(v) && (v as number) < Number.MAX_SAFE_INTEGER,
      payload: object,
    })(value)
  )
    throw new CloudValidationError();
  const mutation = value as unknown as CloudMutation;
  validateCloudEntity(mutation.type, mutation.payload);
  if (mutation.id !== mutation.payload.id) throw new CloudValidationError();
}

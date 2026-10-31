/** Runtime validation at the trust boundary, before any database writes. */
type Check = (value: unknown) => boolean;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text: Check = (v) => typeof v === 'string';
const id: Check = (v) => typeof v === 'string' && v.length > 0;
const number: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const positive: Check = (v) => number(v) && (v as number) > 0;
const nonnegative: Check = (v) => number(v) && (v as number) >= 0;
const bool: Check = (v) => typeof v === 'boolean';
const date: Check = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const time: Check = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const stamp: Check = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const choices =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const optional =
  (check: Check): Check =>
  (v) =>
    v == null || check(v);
const array =
  (check: Check): Check =>
  (v) =>
    Array.isArray(v) && v.every(check);
const shape =
  (fields: Record<string, Check>): Check =>
  (v) =>
    object(v) && Object.entries(fields).every(([key, check]) => check(v[key]));
const base = {
  id,
  createdAt: stamp,
  updatedAt: stamp,
  deletedAt: optional(stamp),
};
const nutrients = shape({
  kcal: nonnegative,
  proteinG: nonnegative,
  fatG: nonnegative,
  carbG: nonnegative,
  fiberG: optional(nonnegative),
  sugarG: optional(nonnegative),
  sodiumMg: optional(nonnegative),
  satFatG: optional(nonnegative),
});
const component = shape({ foodId: id, grams: positive });
const plannedItem = shape({
  id,
  exerciseId: id,
  order: nonnegative,
  targetSets: positive,
  targetRepsMin: nonnegative,
  targetRepsMax: nonnegative,
  restSec: nonnegative,
});
const rating = choices(1, 2, 3, 4, 5);
const diary = {
  date,
  time,
  mealSlotId: id,
  kind: choices('food', 'dish', 'recipe', 'quick'),
  nutrients,
  grams: optional(positive),
  inputMethod: choices('search', 'barcode', 'quick', 'photo', 'text', 'repeat', 'plan'),
};
const schedule: Check = (v) =>
  object(v) &&
  (v.type === 'daily' ||
    (v.type === 'weekdays' && array(choices(1, 2, 3, 4, 5, 6, 7))(v.days)) ||
    (v.type === 'timesPerWeek' && choices(1, 2, 3, 4, 5, 6, 7)(v.times)) ||
    (v.type === 'everyNDays' && positive(v.n) && Number.isInteger(v.n)));
const fields: Record<string, Record<string, Check>> = {
  profile: {
    name: text,
    sex: choices('male', 'female'),
    birthDate: date,
    heightCm: positive,
    activityLevel: positive,
    goal: choices('lose', 'maintain', 'gain'),
    goalRatePerWeekKg: number,
  },
  foods: {
    name: id,
    source: choices('seed', 'off', 'usda', 'user', 'ai'),
    per100: nutrients,
    servings: array(shape({ id, name: text, grams: positive })),
    basis: choices('mass', 'volume'),
    searchKey: text,
    useCount: nonnegative,
    isFavorite: bool,
  },
  dishes: {
    name: id,
    components: array(component),
    totalGrams: nonnegative,
    useCount: nonnegative,
    isFavorite: bool,
  },
  recipes: {
    name: id,
    components: array(component),
    yieldGrams: positive,
    servings: positive,
    useCount: nonnegative,
    isFavorite: bool,
  },
  diary,
  water: { date, time, ml: positive },
  fasting: { startAt: stamp, endAt: optional(stamp), targetHours: positive },
  substances: {
    date,
    time,
    kind: choices('alcohol', 'caffeine'),
    amount: nonnegative,
    label: text,
  },
  mealPlans: {
    weekStart: date,
    days: array(
      shape({
        date,
        slots: array(
          shape({
            mealSlotId: id,
            kind: choices('dish', 'recipe', 'food'),
            refId: id,
            grams: positive,
          }),
        ),
      }),
    ),
  },
  shoppingLists: {
    items: array(shape({ name: text, grams: nonnegative, category: text, checked: bool })),
  },
  dayTemplates: {
    name: id,
    entries: array(shape({ ...diary, date: optional(date) })),
  },
  exercises: {
    name: id,
    source: choices('seed', 'user'),
    primaryMuscles: array(text),
    secondaryMuscles: array(text),
    equipment: id,
    category: id,
    instructions: array(text),
    imageIds: array(text),
    searchKey: text,
  },
  routines: {
    name: id,
    source: choices('template', 'user'),
    days: array(shape({ id, name: text, order: nonnegative, items: array(plannedItem) })),
  },
  workouts: {
    name: text,
    date,
    startedAt: stamp,
    finishedAt: optional(stamp),
    totalVolumeKg: nonnegative,
    totalSets: nonnegative,
    exerciseOrder: array(id),
  },
  workoutSets: {
    workoutId: id,
    exerciseId: id,
    order: nonnegative,
    weightKg: nonnegative,
    reps: nonnegative,
    type: choices('normal', 'warmup', 'drop', 'failure'),
    isCompleted: bool,
    estimated1RM: nonnegative,
  },
  cardio: { date, time, kind: id, durationSec: positive },
  plannedWorkouts: {
    name: text,
    plannedDate: date,
    status: choices('planned', 'started', 'completed', 'skipped'),
    items: array(plannedItem),
  },
  body: {
    date,
    weightKg: optional(positive),
    measurements: optional((v) => object(v) && Object.values(v).every(nonnegative)),
  },
  sleep: {
    date,
    bedAt: time,
    wakeAt: time,
    durationMin: nonnegative,
    quality: rating,
  },
  checkins: {
    date,
    mood: rating,
    energy: rating,
    stress: rating,
    soreness: rating,
    steps: optional(nonnegative),
  },
  habits: {
    name: id,
    icon: text,
    schedule,
    archived: bool,
    order: nonnegative,
    polarity: optional(choices('build', 'quit')),
  },
  habitLogs: { habitId: id, date, completed: bool },
  xpEvents: { date, reason: id, amount: number, dedupeKey: id },
};

const settings = shape({
  id: choices('singleton'),
  updatedAt: stamp,
  locale: choices('ru', 'en'),
  theme: choices('light', 'dark', 'system'),
  units: choices('metric', 'imperial'),
  firstDayOfWeek: choices(1, 7),
  mealSlots: array(shape({ id, name: text, order: nonnegative })),
  targets: shape({
    mode: choices('calculated', 'manual'),
    kcal: positive,
    proteinG: nonnegative,
    fatG: nonnegative,
    carbG: nonnegative,
    fiberG: nonnegative,
    sugarMaxG: nonnegative,
    sodiumMaxMg: nonnegative,
    waterMl: positive,
  }),
  ai: shape({
    enabled: bool,
    features: object,
    monthlyCallLimit: nonnegative,
    callsThisMonth: nonnegative,
  }),
  sync: object,
  fasting: shape({
    enabled: bool,
    windowHours: positive,
    startHour: nonnegative,
  }),
  plates: shape({ availableKg: array(positive), barKg: nonnegative }),
  restTimer: shape({ defaultSec: nonnegative, sound: bool, vibrate: bool }),
  waterPresetsMl: array(positive),
  addFoodTabs: array(id),
  onboardingDone: bool,
});

export function validBackupPayload(value: unknown, tables: readonly string[]): boolean {
  if (
    !object(value) ||
    !stamp(value.exportedAt) ||
    !shape({ id, name: text })(value.profile) ||
    !object(value.tables)
  )
    return false;
  if (!array(shape({ id, mime: id, data: text, createdAt: stamp }))(value.blobs)) return false;
  const blobIds = (value.blobs as { id: string }[]).map((blob) => blob.id);
  if (new Set(blobIds).size !== blobIds.length) return false;
  for (const [name, rows] of Object.entries(value.tables)) {
    if (!tables.includes(name) || !Array.isArray(rows)) return false;
    const check =
      name === 'settings'
        ? settings
        : name === 'meta'
          ? shape({ key: id })
          : name === 'gameState'
            ? shape({
                id: choices('singleton'),
                xp: nonnegative,
                level: positive,
                freezes: nonnegative,
                streaks: object,
                unlockedAchievements: array(shape({ key: id, unlockedAt: stamp })),
                updatedAt: stamp,
              })
            : shape({ ...base, ...fields[name] });
    if (!rows.every(check)) return false;
    const keys = rows.map((r: Record<string, unknown>) => r[name === 'meta' ? 'key' : 'id']);
    if (new Set(keys).size !== keys.length) return false;
  }
  return true;
}

/** Resolve references against the exact post-import state, including tombstones. */
export function validReferences(tables: Record<string, unknown[]>): boolean {
  const rows = (name: string) => (tables[name] ?? []).filter(object);
  const ids = (name: string) => new Set(rows(name).map((row) => row.id));
  const foods = ids('foods');
  const exercises = ids('exercises');
  const workouts = ids('workouts');
  const habits = ids('habits');
  const linked = (value: unknown, target: Set<unknown>, required = false) =>
    value == null ? !required : target.has(value);
  for (const row of rows('workoutSets'))
    if (!linked(row.workoutId, workouts, true) || !linked(row.exerciseId, exercises, true))
      return false;
  for (const row of rows('habitLogs')) if (!linked(row.habitId, habits, true)) return false;
  for (const name of ['dishes', 'recipes']) {
    for (const row of rows(name))
      for (const component of row.components as Record<string, unknown>[])
        if (!linked(component.foodId, foods, true)) return false;
  }
  for (const row of rows('workouts'))
    if (!(row.exerciseOrder as unknown[]).every((id) => exercises.has(id))) return false;
  for (const row of rows('plannedWorkouts')) {
    if (!linked(row.workoutId, workouts)) return false;
    if (!(row.items as Record<string, unknown>[]).every((item) => exercises.has(item.exerciseId)))
      return false;
  }
  for (const row of rows('routines'))
    for (const day of row.days as Record<string, unknown>[]) {
      if (!(day.items as Record<string, unknown>[]).every((item) => exercises.has(item.exerciseId)))
        return false;
    }
  for (const row of rows('diary')) {
    if (row.kind === 'quick') continue;
    const target = row.kind === 'food' ? foods : ids(row.kind === 'dish' ? 'dishes' : 'recipes');
    if (!linked(row.refId, target, true)) return false;
  }
  return true;
}

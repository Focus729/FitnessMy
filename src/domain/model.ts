/**
 * Модель данных — раздел 6 ТЗ.
 *
 * Это чистые типы: ни React, ни Dexie, ни сеть. Слои data/ и UI импортируют
 * их отсюда, обратной зависимости нет (правило 5.1).
 *
 * Единицы (5.5): масса — граммы, объём — миллилитры, энергия — ккал,
 * длина — сантиметры, время — секунды. Имперские единицы — только отображение.
 */

/** Служебные поля есть у каждой записи. deletedAt — мягкое удаление для слияния копий. */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** YYYY-MM-DD в локальном времени пользователя (см. 6). */
export type LocalDate = string;
/** HH:mm */
export type LocalTime = string;

/* ────────────────────────────── 6.1 Профиль и настройки ────────────────────── */

export type ActivityLevel = 1.2 | 1.375 | 1.55 | 1.725 | 1.9;
export type Goal = 'lose' | 'maintain' | 'gain';

export interface Profile extends BaseRecord {
  name: string;
  sex: 'male' | 'female';
  birthDate: LocalDate;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  goalRatePerWeekKg: number;
  bodyFatPct?: number;
  pinHash?: string;
}

export interface MealSlot {
  id: string;
  name: string;
  order: number;
  defaultTime?: LocalTime;
  targetKcalShare?: number;
}

export interface NutritionTargets {
  mode: 'calculated' | 'manual';
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number;
  sugarMaxG: number;
  sodiumMaxMg: number;
  waterMl: number;
  calculated?: { kcal: number; proteinG: number; fatG: number; carbG: number };
  /** Вес, на котором была посчитана норма. Нужен для правила пересчёта из 8.2. */
  basedOnWeightKg?: number;
}

export interface AISettings {
  enabled: boolean;
  provider: string | null;
  apiKey: string | null;
  model: string | null;
  features: {
    photoFood: boolean;
    textFood: boolean;
    labelScan: boolean;
    coach: boolean;
    workoutGen: boolean;
    menuGen: boolean;
    weeklyReview: boolean;
  };
  monthlyCallLimit: number;
  callsThisMonth: number;
  callsMonthKey: string;
}

/** Порядок вкладок на экране добавления еды настраивается (9.2). */
export type AddFoodTab =
  | 'frequent'
  | 'search'
  | 'barcode'
  | 'quick'
  | 'dishes'
  | 'recipes'
  | 'copyDay'
  | 'photoAi'
  | 'textAi';

export interface Settings {
  id: 'singleton';
  locale: 'ru' | 'en';
  theme: 'light' | 'dark' | 'system';
  units: 'metric' | 'imperial';
  firstDayOfWeek: 1 | 7;
  mealSlots: MealSlot[];
  targets: NutritionTargets;
  gamificationEnabled: boolean;
  showSteps: boolean;
  showSleep: boolean;
  fasting: { enabled: boolean; windowHours: number; startHour: number };
  ai: AISettings;
  sync: { provider: 'none' | 'gdrive'; lastBackupAt?: string; gdriveClientId?: string };
  waterPresetsMl: number[];
  addFoodTabs: AddFoodTab[];
  /** Набор блинов для плана блинов (10.1) и вес грифа по умолчанию. */
  plates: { availableKg: number[]; barKg: number };
  restTimer: { sound: boolean; vibrate: boolean; defaultSec: number };
  onboardingDone: boolean;
  updatedAt: string;
}

/* ────────────────────────────────── 6.2 Питание ─────────────────────────────── */

export interface Nutrients {
  kcal: number;
  proteinG: number;
  fatG: number;
  satFatG?: number;
  carbG: number;
  sugarG?: number;
  fiberG?: number;
  sodiumMg?: number;
}

export interface Serving {
  id: string;
  name: string;
  grams: number;
  isDefault?: boolean;
}

export type FoodSource = 'seed' | 'off' | 'usda' | 'user' | 'ai';

export interface Food extends BaseRecord {
  source: FoodSource;
  externalId?: string;
  name: string;
  nameI18n?: { ru?: string; en?: string };
  brand?: string;
  barcode?: string;
  /** Все нутриенты — на 100 г или 100 мл. */
  per100: Nutrients;
  servings: Serving[];
  basis: 'mass' | 'volume';
  novaGroup?: 1 | 2 | 3 | 4;
  isFavorite: boolean;
  useCount: number;
  lastUsedAt?: string;
  lastGrams?: number;
  verified: boolean;
  category?: string;
  /** Предвычисленное поле для быстрого поиска (7.1). */
  searchKey: string;
}

export interface Dish extends BaseRecord {
  name: string;
  components: { foodId: string; grams: number }[];
  totalGrams: number;
  isFavorite: boolean;
  useCount: number;
  lastUsedAt?: string;
  lastGrams?: number;
}

export interface Recipe extends BaseRecord {
  name: string;
  components: { foodId: string; grams: number }[];
  /** Вес готового блюда — учитывает уварку (9.3). */
  yieldGrams: number;
  servings: number;
  steps?: string[];
  photoBlobId?: string;
  isFavorite: boolean;
  useCount: number;
}

export type DiaryKind = 'food' | 'dish' | 'recipe' | 'quick';
export type InputMethod = 'search' | 'barcode' | 'quick' | 'photo' | 'text' | 'repeat' | 'plan';

export interface DiaryEntry extends BaseRecord {
  date: LocalDate;
  time: LocalTime;
  mealSlotId: string;
  kind: DiaryKind;
  refId?: string;
  quickName?: string;
  grams?: number;
  servingId?: string;
  servingCount?: number;
  /** Денормализовано намеренно: история дневника неизменна (см. врезку в 6.2). */
  nutrients: Nutrients;
  inputMethod: InputMethod;
  aiGenerated?: boolean;
  aiConfidence?: 'low' | 'medium' | 'high';
  novaGroup?: 1 | 2 | 3 | 4;
}

export interface WaterEntry extends BaseRecord {
  date: LocalDate;
  time: LocalTime;
  ml: number;
}

export interface FastingSession extends BaseRecord {
  startAt: string;
  endAt?: string;
  targetHours: number;
}

export interface SubstanceEntry extends BaseRecord {
  date: LocalDate;
  time: LocalTime;
  kind: 'alcohol' | 'caffeine';
  /** мл чистого спирта или мг кофеина */
  amount: number;
  label: string;
  kcal?: number;
}

export interface MealPlanSlotItem {
  mealSlotId: string;
  kind: 'dish' | 'recipe' | 'food';
  refId: string;
  grams: number;
  /** «Не трогать при пересчёте» (9.5) */
  pinned?: boolean;
}

export interface MealPlan extends BaseRecord {
  weekStart: LocalDate;
  days: { date: LocalDate; slots: MealPlanSlotItem[] }[];
}

export interface ShoppingListItem {
  name: string;
  grams: number;
  category: string;
  checked: boolean;
}

export interface ShoppingList extends BaseRecord {
  mealPlanId?: string;
  items: ShoppingListItem[];
}

/** Шаблон дня (9.3 / B4-г) */
export interface DayTemplate extends BaseRecord {
  name: string;
  entries: Omit<DiaryEntry, keyof BaseRecord | 'date'>[];
}

/* ───────────────────────────────── 6.3 Тренировки ───────────────────────────── */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'lats'
  | 'traps'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'obliques'
  | 'lowerBack'
  | 'neck'
  | 'fullBody';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'smith'
  | 'ezBar'
  | 'other';

export interface Exercise extends BaseRecord {
  source: 'seed' | 'user';
  name: string;
  nameI18n?: { ru?: string; en?: string };
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  mechanic?: 'compound' | 'isolation';
  category: 'strength' | 'cardio' | 'stretching' | 'plyometrics';
  instructions: string[];
  imageIds: string[];
  isCustom: boolean;
  isFavorite: boolean;
  defaultRestSec?: number;
  barWeightKg?: number;
  /** Верх/низ тела — нужно для шага прогрессии (10.3). */
  bodyPart?: 'upper' | 'lower';
  searchKey: string;
}

export interface RoutineItem {
  id: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRpe?: number;
  restSec: number;
}

export interface RoutineDay {
  id: string;
  name: string;
  order: number;
  items: RoutineItem[];
}

export interface Routine extends BaseRecord {
  name: string;
  source: 'template' | 'user';
  templateKey?: string;
  days: RoutineDay[];
  notes?: string;
  /** Индекс следующего дня по циклу. */
  nextDayIndex?: number;
  archived?: boolean;
}

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSet extends BaseRecord {
  workoutId: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string;
  weightKg: number;
  reps: number;
  rpe?: number;
  type: SetType;
  isCompleted: boolean;
  restTakenSec?: number;
  note?: string;
  estimated1RM: number;
}

export interface Workout extends BaseRecord {
  date: LocalDate;
  startedAt: string;
  finishedAt?: string;
  routineId?: string;
  routineDayId?: string;
  name: string;
  notes?: string;
  feelRating?: 1 | 2 | 3 | 4 | 5;
  totalVolumeKg: number;
  totalSets: number;
  /** Порядок упражнений в активной тренировке. */
  exerciseOrder: string[];
}

export type PlannedStatus = 'planned' | 'started' | 'completed' | 'skipped';

export interface PlannedItem {
  id: string;
  exerciseId: string;
  order: number;
  supersetGroup?: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetWeightKg?: number;
  targetRpe?: number;
  restSec: number;
}

/**
 * Запланированная тренировка — намерение, а не факт.
 *
 * Отдельная сущность, а не поле `status` в `Workout`: у `Workout` подходы уже
 * выполнены и содержат факт (вес, повторы, отметка), план же содержит цель
 * (диапазон повторов). Смешивать их в одной таблице — источник багов в
 * агрегатах и графиках, потому что планы начнут попадать в статистику.
 *
 * Служебные даты — ISO-строки, как у всех остальных таблиц: слияние резервных
 * копий сравнивает `updatedAt` лексикографически, и число здесь сломало бы
 * сравнение.
 */
export interface PlannedWorkout extends BaseRecord {
  plannedDate: LocalDate;
  routineId?: string;
  routineDayId?: string;
  name: string;
  items: PlannedItem[];
  notes?: string;
  status: PlannedStatus;
  /** Ссылка на созданную тренировку после старта. */
  workoutId?: string;
}

export interface CardioSession extends BaseRecord {
  date: LocalDate;
  time: LocalTime;
  kind: 'run' | 'walk' | 'bike' | 'swim' | 'row' | 'elliptical' | 'other';
  durationSec: number;
  distanceM?: number;
  avgHr?: number;
  kcal?: number;
  note?: string;
}

/* ──────────────────── 6.4 Тело, здоровье, привычки, игровой слой ────────────── */

export type MeasurementKey =
  | 'neck'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'thighL'
  | 'thighR'
  | 'armL'
  | 'armR'
  | 'calfL'
  | 'calfR';

export interface BodyMetric extends BaseRecord {
  date: LocalDate;
  weightKg?: number;
  measurements?: Partial<Record<MeasurementKey, number>>;
  note?: string;
}

export interface SleepLog extends BaseRecord {
  /** День пробуждения. */
  date: LocalDate;
  bedAt: LocalTime;
  wakeAt: LocalTime;
  durationMin: number;
  quality: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

export interface DailyCheckin extends BaseRecord {
  date: LocalDate;
  mood: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  stress: 1 | 2 | 3 | 4 | 5;
  soreness: 1 | 2 | 3 | 4 | 5;
  steps?: number;
  note?: string;
}

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }
  | { type: 'timesPerWeek'; times: number }
  | { type: 'everyNDays'; n: number };

/**
 * `build` — привычку хотят выработать (существующее поведение).
 * `quit` — от привычки хотят отказаться: важен непрерывный счётчик дней
 * воздержания, а пропущенный день серию не рвёт (задача 3 v0.7).
 */
export type HabitPolarity = 'build' | 'quit';

export interface Habit extends BaseRecord {
  name: string;
  icon: string;
  schedule: HabitSchedule;
  targetValue?: number;
  unit?: string;
  archived: boolean;
  order: number;
  polarity: HabitPolarity;
  /** Дата отказа, YYYY-MM-DD. Только для polarity === 'quit'. */
  quitStartDate?: LocalDate;
}

export interface HabitLog extends BaseRecord {
  habitId: string;
  date: LocalDate;
  value?: number;
  completed: boolean;
  usedFreeze?: boolean;
  /** Для привычек типа `quit`: день выдержан или был срыв. */
  outcome?: 'success' | 'relapse';
  relapseNote?: string;
  /** Например, сколько сигарет. Опционально. */
  relapseCount?: number;
}

export interface StreakState {
  current: number;
  best: number;
  lastDate: LocalDate;
}

export interface GameState {
  id: 'singleton';
  xp: number;
  level: number;
  freezes: number;
  streaks: Record<string, StreakState>;
  unlockedAchievements: { key: string; unlockedAt: string }[];
  updatedAt: string;
}

export interface XpEvent extends BaseRecord {
  date: LocalDate;
  reason: string;
  amount: number;
  /** Ключ дедупликации: одно и то же действие не начисляет опыт дважды. */
  dedupeKey: string;
}

export interface BlobRecord {
  id: string;
  mime: string;
  data: Blob;
  createdAt: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

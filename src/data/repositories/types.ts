/**
 * Интерфейсы репозиториев — раздел 5 и решение 2.9.
 *
 * Весь доступ к данным идёт только через этот слой. Замена Dexie на серверную
 * реализацию — это новая реализация тех же интерфейсов, без переписывания
 * приложения. Поэтому здесь нет ни одного типа из Dexie.
 */
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
  LocalDate,
  MealPlan,
  PlannedWorkout,
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

/** Данные для создания записи: служебные поля проставляет репозиторий. */
export type NewRecord<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  id?: string;
};

export interface CrudRepo<T> {
  get(id: string): Promise<T | undefined>;
  all(): Promise<T[]>;
  create(data: NewRecord<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<void>;
  /** Мягкое удаление: проставляет deletedAt — нужно для слияния копий (6). */
  remove(id: string): Promise<void>;
  /** Возврат мягко удалённой записи — плашка «Удалено. Вернуть» (18.5). */
  restore(id: string): Promise<void>;
  bulkPut(items: T[]): Promise<void>;
  count(): Promise<number>;
}

export interface FoodRepo extends CrudRepo<Food> {
  byBarcode(barcode: string): Promise<Food | undefined>;
  byExternalId(source: Food['source'], externalId: string): Promise<Food | undefined>;
  search(query: string, limit?: number): Promise<Food[]>;
  frequent(limit?: number): Promise<Food[]>;
  /** Отмечает использование: useCount, lastUsedAt, lastGrams (7.1). */
  markUsed(id: string, grams?: number): Promise<void>;
  toggleFavorite(id: string): Promise<void>;
}

export interface DiaryRepo extends CrudRepo<DiaryEntry> {
  addBatch(entries: NewRecord<DiaryEntry>[]): Promise<void>;
  byDate(date: LocalDate): Promise<DiaryEntry[]>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<DiaryEntry[]>;
  copyDay(from: LocalDate, to: LocalDate): Promise<number>;
  distinctFoodCount(from: LocalDate, to: LocalDate): Promise<number>;
  loggedDates(from: LocalDate, to: LocalDate): Promise<LocalDate[]>;
}

export interface WaterRepo extends CrudRepo<WaterEntry> {
  byDate(date: LocalDate): Promise<WaterEntry[]>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<WaterEntry[]>;
  totalForDate(date: LocalDate): Promise<number>;
}

export interface WorkoutRepo extends CrudRepo<Workout> {
  startFree(name: string): Promise<Workout>;
  startRoutine(routineId: string): Promise<Workout>;
  startPlanned(planId: string): Promise<Workout>;
  byDate(date: LocalDate): Promise<Workout[]>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<Workout[]>;
  /** Незавершённая тренировка — предлагается продолжить (10.1). */
  unfinished(): Promise<Workout | undefined>;
  recent(limit: number): Promise<Workout[]>;

  /* ── Правка завершённой тренировки (задача 1 v0.7) ──────────────────────
     Все методы ниже пересчитывают агрегаты `totalVolumeKg` и `totalSets`
     через domain/training/aggregates. Компонент их не считает. */

  updateWorkout(id: string, patch: Partial<Workout>): Promise<void>;
  updateSet(setId: string, patch: Partial<WorkoutSet>): Promise<void>;
  addSetToWorkout(workoutId: string, set: NewRecord<WorkoutSet>): Promise<string>;
  removeSet(setId: string): Promise<void>;
  /** Мягкое удаление с пересчётом связанного плана. */
  softDeleteWorkout(id: string): Promise<void>;
  restoreWorkout(id: string): Promise<void>;
  /** Завершение тренировки: проставляет finishedAt и считает агрегаты. */
  finishWorkout(
    id: string,
    patch?: { feelRating?: 1 | 2 | 3 | 4 | 5; notes?: string },
  ): Promise<void>;
  /** Пересчёт агрегатов по текущим подходам. */
  recalcTotals(workoutId: string): Promise<void>;
}

export interface PlannedWorkoutRepo extends CrudRepo<PlannedWorkout> {
  byDate(date: LocalDate): Promise<PlannedWorkout[]>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<PlannedWorkout[]>;
  /** Ближайший незапущенный план — источник строки «Ближайшее» (13). */
  upcoming(today: LocalDate): Promise<PlannedWorkout | undefined>;
  /** Просроченные: дата прошла, тренировка не начата. Не удаляются. */
  overdue(today: LocalDate): Promise<PlannedWorkout[]>;
  /** Массовый перенос с опциональным сдвигом последующих. */
  reschedule(id: string, newDate: LocalDate, shiftFollowing: boolean): Promise<void>;
  setStatus(id: string, status: PlannedWorkout['status'], workoutId?: string): Promise<void>;
}

export interface WorkoutSetRepo extends CrudRepo<WorkoutSet> {
  ensureInitial(data: NewRecord<WorkoutSet>): Promise<void>;
  byWorkout(workoutId: string): Promise<WorkoutSet[]>;
  byExercise(exerciseId: string, limit?: number): Promise<WorkoutSet[]>;
  /** Подходы этого упражнения на предыдущей тренировке (C2-в). */
  lastSessionSets(exerciseId: string, excludeWorkoutId?: string): Promise<WorkoutSet[]>;
  /** Рабочие веса последних тренировок — вход для правила разгрузки (10.3). */
  recentTopWeights(exerciseId: string, sessions: number): Promise<number[]>;
}

export interface ExerciseRepo extends CrudRepo<Exercise> {
  search(query: string, limit?: number): Promise<Exercise[]>;
  byMuscle(muscle: string): Promise<Exercise[]>;
  toggleFavorite(id: string): Promise<void>;
}

export interface BodyRepo extends CrudRepo<BodyMetric> {
  byDate(date: LocalDate): Promise<BodyMetric | undefined>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<BodyMetric[]>;
  latestWeight(): Promise<{ date: LocalDate; weightKg: number } | undefined>;
  /** Дата последнего замера объёмов — для мягкого напоминания (11.1). */
  lastMeasurementDate(): Promise<LocalDate | undefined>;
}

export interface DatedRepo<T> extends CrudRepo<T> {
  byDate(date: LocalDate): Promise<T | undefined>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<T[]>;
}

export interface HabitLogRepo extends CrudRepo<HabitLog> {
  byDate(date: LocalDate): Promise<HabitLog[]>;
  byDateRange(from: LocalDate, to: LocalDate): Promise<HabitLog[]>;
  byHabit(habitId: string): Promise<HabitLog[]>;
  toggle(habitId: string, date: LocalDate, value?: number): Promise<void>;
}

export interface SettingsRepo {
  get(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<Settings>;
}

export interface ProfileRepo {
  get(): Promise<Profile | undefined>;
  save(profile: Omit<Profile, 'createdAt' | 'updatedAt'> & Partial<Profile>): Promise<Profile>;
}

export interface GameRepo {
  get(): Promise<GameState>;
  update(patch: Partial<GameState>): Promise<GameState>;
  /** Начисляет опыт, если ключ дедупликации ещё не использован. */
  awardXp(args: {
    reason: string;
    amount: number;
    date: LocalDate;
    dedupeKey: string;
  }): Promise<boolean>;
  events(limit?: number): Promise<XpEvent[]>;
}

export interface BlobRepo {
  get(id: string): Promise<BlobRecord | undefined>;
  put(blob: Blob, mime: string, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
  all(): Promise<BlobRecord[]>;
}

export interface MetaRepo {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

/** Полный набор репозиториев профиля. */
export interface Repositories {
  profileId: string;
  finishOnboarding(profile: Parameters<ProfileRepo['save']>[0], date: LocalDate, weightKg: number, targets: Settings['targets']): Promise<void>;
  profile: ProfileRepo;
  settings: SettingsRepo;
  foods: FoodRepo;
  dishes: CrudRepo<Dish>;
  recipes: CrudRepo<Recipe>;
  diary: DiaryRepo;
  water: WaterRepo;
  fasting: CrudRepo<FastingSession>;
  substances: CrudRepo<SubstanceEntry> & {
    byDate(date: LocalDate): Promise<SubstanceEntry[]>;
    byDateRange(from: LocalDate, to: LocalDate): Promise<SubstanceEntry[]>;
  };
  mealPlans: CrudRepo<MealPlan> & {
    byWeek(weekStart: LocalDate): Promise<MealPlan | undefined>;
  };
  shoppingLists: CrudRepo<ShoppingList>;
  dayTemplates: CrudRepo<DayTemplate>;
  exercises: ExerciseRepo;
  routines: CrudRepo<Routine>;
  workouts: WorkoutRepo;
  workoutSets: WorkoutSetRepo;
  plannedWorkouts: PlannedWorkoutRepo;
  cardio: CrudRepo<CardioSession> & {
    byDateRange(from: LocalDate, to: LocalDate): Promise<CardioSession[]>;
  };
  body: BodyRepo;
  sleep: DatedRepo<SleepLog>;
  checkins: DatedRepo<DailyCheckin>;
  habits: CrudRepo<Habit>;
  habitLogs: HabitLogRepo;
  game: GameRepo;
  blobs: BlobRepo;
  meta: MetaRepo;
}

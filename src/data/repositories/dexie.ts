/**
 * Реализация репозиториев на Dexie.
 *
 * Это единственный файл, кроме data/db/schema.ts, который знает про Dexie.
 * Всё остальное приложение работает с интерфейсами из ./types.
 */
import type { Table } from 'dexie';
import { openDb, type LentaDB } from '@/data/db/schema';
import { uuid } from '@/lib/id';
import { nowIso, today } from '@/lib/date';
import {
  searchFoods,
  searchKeyFor,
  frequentFoods,
  tokenize,
  matches,
} from '@/domain/nutrition/search';
import type {
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
import { defaultSettings } from '@/data/defaults';
import type {
  BlobRepo,
  BodyRepo,
  CrudRepo,
  DatedRepo,
  DiaryRepo,
  ExerciseRepo,
  FoodRepo,
  GameRepo,
  HabitLogRepo,
  MetaRepo,
  NewRecord,
  PlannedWorkoutRepo,
  ProfileRepo,
  Repositories,
  SettingsRepo,
  WaterRepo,
  WorkoutRepo,
  WorkoutSetRepo,
} from './types';
import { levelForXp } from '@/domain/gamification/xp';
import { recalcWorkoutTotals } from '@/domain/training/aggregates';
import { epley1RM } from '@/domain/training/oneRm';
import { prefillFromLast } from '@/domain/training/progression';
import {
  overduePlans,
  reschedule as reschedulePlans,
  upcomingPlan,
} from '@/domain/training/planning';

interface HasBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Общий CRUD. Мягкое удаление — обязательное требование модели (раздел 6). */
function crud<T extends HasBase>(table: Table<T, string>): CrudRepo<T> {
  const live = async (): Promise<T[]> => (await table.toArray()).filter((r) => !r.deletedAt);

  return {
    async get(id) {
      const row = await table.get(id);
      return row && !row.deletedAt ? row : undefined;
    },
    all: live,
    async create(data: NewRecord<T>) {
      const ts = nowIso();
      const record = {
        ...(data as object),
        id: data.id ?? uuid(),
        createdAt: ts,
        updatedAt: ts,
      } as T;
      await table.put(record);
      return record;
    },
    async update(id, patch) {
      await table.update(id, { ...patch, updatedAt: nowIso() } as never);
    },
    async remove(id) {
      const ts = nowIso();
      await table.update(id, { deletedAt: ts, updatedAt: ts } as never);
    },
    async restore(id) {
      await table.update(id, {
        deletedAt: undefined,
        updatedAt: nowIso(),
      } as never);
    },
    async bulkPut(items) {
      await table.bulkPut(items);
    },
    async count() {
      return (await live()).length;
    },
  };
}

function makeFoodRepo(db: LentaDB): FoodRepo {
  const base = crud<Food>(db.foods);
  return {
    ...base,
    async create(data) {
      const withKey = {
        ...data,
        searchKey: data.searchKey || searchKeyFor(data as Food),
      };
      return base.create(withKey as NewRecord<Food>);
    },
    async update(id, patch) {
      const next: Partial<Food> = { ...patch };
      if (patch.name || patch.nameI18n || patch.brand) {
        const current = await db.foods.get(id);
        if (current) next.searchKey = searchKeyFor({ ...current, ...patch });
      }
      await base.update(id, next);
    },
    async byBarcode(barcode) {
      const row = await db.foods.where('barcode').equals(barcode).first();
      return row && !row.deletedAt ? row : undefined;
    },
    async byExternalId(source, externalId) {
      const rows = await db.foods.where('source').equals(source).toArray();
      return rows.find((r) => r.externalId === externalId && !r.deletedAt);
    },
    async search(query, limit = 50) {
      return searchFoods(await base.all(), query, limit);
    },
    async frequent(limit = 12) {
      // IndexedDB не индексирует булевы значения, поэтому избранное отбирается
      // по загруженному набору, а не запросом по индексу isFavorite.
      const used = (await db.foods.where('useCount').above(0).toArray()).filter(
        (f) => !f.deletedAt,
      );
      const favorites = (await base.all()).filter((f) => f.isFavorite);
      return frequentFoods(dedupe([...favorites, ...used]), limit);
    },
    async markUsed(id, grams) {
      const food = await db.foods.get(id);
      if (!food) return;
      await db.foods.update(id, {
        useCount: (food.useCount ?? 0) + 1,
        lastUsedAt: nowIso(),
        lastGrams: grams ?? food.lastGrams,
        updatedAt: nowIso(),
      });
    },
    async toggleFavorite(id) {
      const food = await db.foods.get(id);
      if (!food) return;
      await db.foods.update(id, {
        isFavorite: !food.isFavorite,
        updatedAt: nowIso(),
      });
    },
  };
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const i of items) if (!seen.has(i.id)) seen.set(i.id, i);
  return [...seen.values()];
}

function makeDiaryRepo(db: LentaDB): DiaryRepo {
  const base = crud<DiaryEntry>(db.diary);
  const byDate = async (date: LocalDate) =>
    (await db.diary.where('date').equals(date).toArray())
      .filter((e) => !e.deletedAt)
      .sort((a, b) => a.time.localeCompare(b.time));

  return {
    ...base,
    async addBatch(entries) {
      await db.transaction('rw', db.diary, async () => {
        for (const entry of entries) {
          if (entry.id && (await db.diary.get(entry.id))) continue;
          await base.create(entry);
        }
      });
    },
    byDate,
    async byDateRange(from, to) {
      return (await db.diary.where('date').between(from, to, true, true).toArray()).filter(
        (e) => !e.deletedAt,
      );
    },
    async copyDay(from, to) {
      const entries = await byDate(from);
      const ts = nowIso();
      const copies = entries.map((e) => ({
        ...e,
        id: uuid(),
        date: to,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: undefined,
        inputMethod: 'repeat' as const,
      }));
      await db.diary.bulkPut(copies);
      return copies.length;
    },
    async distinctFoodCount(from, to) {
      const entries = (await db.diary.where('date').between(from, to, true, true).toArray()).filter(
        (e) => !e.deletedAt,
      );
      return new Set(entries.map((e) => e.refId ?? e.quickName ?? e.id)).size;
    },
    async loggedDates(from, to) {
      const entries = (await db.diary.where('date').between(from, to, true, true).toArray()).filter(
        (e) => !e.deletedAt,
      );
      return [...new Set(entries.map((e) => e.date))].sort();
    },
  };
}

function makeWaterRepo(db: LentaDB): WaterRepo {
  const base = crud<WaterEntry>(db.water);
  const byDate = async (date: LocalDate) =>
    (await db.water.where('date').equals(date).toArray()).filter((e) => !e.deletedAt);
  return {
    ...base,
    byDate,
    async byDateRange(from, to) {
      return (await db.water.where('date').between(from, to, true, true).toArray()).filter(
        (e) => !e.deletedAt,
      );
    },
    async totalForDate(date) {
      return (await byDate(date)).reduce((s, e) => s + e.ml, 0);
    },
  };
}

function makeWorkoutRepo(db: LentaDB): WorkoutRepo {
  const base = crud<Workout>(db.workouts);

  /** Пересчёт агрегатов по фактическим подходам. Формула — в domain. */
  const recalcTotals = async (workoutId: string) => {
    const sets = (await db.workoutSets.where('workoutId').equals(workoutId).toArray()).filter(
      (s) => !s.deletedAt,
    );
    await db.workouts.update(workoutId, {
      ...recalcWorkoutTotals(sets),
      updatedAt: nowIso(),
    });
  };

  return {
    ...base,
    async byDate(date) {
      return (await db.workouts.where('date').equals(date).toArray()).filter((w) => !w.deletedAt);
    },
    async byDateRange(from, to) {
      return (await db.workouts.where('date').between(from, to, true, true).toArray()).filter(
        (w) => !w.deletedAt,
      );
    },
    async startPlanned(planId) {
      return db.transaction('rw', db.plannedWorkouts, db.workouts, db.workoutSets, async () => {
        const plan = await db.plannedWorkouts.get(planId);
        if (!plan || plan.deletedAt) throw new Error('Plan unavailable');
        if (plan.workoutId) {
          const existing = await db.workouts.get(plan.workoutId);
          if (existing && !existing.deletedAt) return existing;
        }
        const ts = nowIso();
        const items = [...plan.items].sort((a, b) => a.order - b.order);
        const workout = await base.create({
          date: today(),
          startedAt: ts,
          routineId: plan.routineId,
          routineDayId: plan.routineDayId,
          name: plan.name,
          totalVolumeKg: 0,
          totalSets: 0,
          exerciseOrder: items.map((item) => item.exerciseId),
        });
        const setRepo = makeWorkoutSetRepo(db);
        for (const item of items) {
          const previous = await setRepo.lastSessionSets(item.exerciseId, workout.id);
          for (let index = 0; index < Math.max(1, item.targetSets); index++) {
            const prefill = prefillFromLast(previous, index);
            await setRepo.create({
              workoutId: workout.id,
              exerciseId: item.exerciseId,
              order: index,
              supersetGroup: item.supersetGroup,
              weightKg: item.targetWeightKg ?? prefill?.weightKg ?? 0,
              reps: prefill?.reps ?? item.targetRepsMin,
              type: 'normal',
              isCompleted: false,
              estimated1RM: 0,
            });
          }
        }
        await db.plannedWorkouts.update(plan.id, {
          status: 'started',
          workoutId: workout.id,
          updatedAt: ts,
        });
        return workout;
      });
    },
    async startFree(name) {
      return db.transaction('rw', db.workouts, async () => {
        const active = (await db.workouts.toArray()).find(
          (workout) => !workout.deletedAt && !workout.finishedAt,
        );
        return (
          active ??
          base.create({
            date: today(),
            startedAt: nowIso(),
            name,
            totalVolumeKg: 0,
            totalSets: 0,
            exerciseOrder: [],
          })
        );
      });
    },
    async startRoutine(routineId) {
      return db.transaction('rw', db.workouts, db.routines, async () => {
        const active = (await db.workouts.toArray()).find(
          (workout) => !workout.deletedAt && !workout.finishedAt,
        );
        if (active) return active;
        const routine = await db.routines.get(routineId);
        if (!routine || routine.deletedAt || !routine.days.length)
          throw new Error('Routine unavailable');
        const index = routine.nextDayIndex ?? 0;
        const day = routine.days[index % routine.days.length]!;
        const workout = await base.create({
          date: today(),
          startedAt: nowIso(),
          routineId,
          routineDayId: day.id,
          name: `${routine.name} · ${day.name}`,
          totalVolumeKg: 0,
          totalSets: 0,
          exerciseOrder: [...day.items]
            .sort((a, b) => a.order - b.order)
            .map((item) => item.exerciseId),
        });
        await db.routines.update(routineId, { nextDayIndex: index + 1, updatedAt: nowIso() });
        return workout;
      });
    },
    async unfinished() {
      const all = await base.all();
      return all
        .filter((w) => !w.finishedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    },
    async recent(limit) {
      const all = await base.all();
      return all
        .filter((w) => w.finishedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit);
    },

    recalcTotals,

    async updateWorkout(id, patch) {
      await db.transaction('rw', db.workouts, db.workoutSets, async () => {
        await base.update(id, patch);
        // Дата могла измениться — нигде она не кэшируется отдельно от записи,
        // поэтому история и графики подхватят новое значение сами.
        await recalcTotals(id);
      });
    },

    async updateSet(setId, patch) {
      await db.transaction('rw', db.workoutSets, db.workouts, async () => {
        const current = await db.workoutSets.get(setId);
        if (!current) return;
        const next = { ...current, ...patch };
        await db.workoutSets.update(setId, {
          ...patch,
          estimated1RM: epley1RM(next.weightKg, next.reps),
          updatedAt: nowIso(),
        });
        await recalcTotals(current.workoutId);
      });
    },

    async addSetToWorkout(workoutId, set) {
      return db.transaction('rw', db.workoutSets, db.workouts, async () => {
        const ts = nowIso();
        const record: WorkoutSet = {
          ...(set as object),
          workoutId,
          id: set.id ?? uuid(),
          estimated1RM: epley1RM(set.weightKg, set.reps),
          createdAt: ts,
          updatedAt: ts,
        } as WorkoutSet;
        await db.workoutSets.put(record);
        await recalcTotals(workoutId);
        return record.id;
      });
    },

    async removeSet(setId) {
      await db.transaction('rw', db.workoutSets, db.workouts, async () => {
        const current = await db.workoutSets.get(setId);
        if (!current) return;
        const ts = nowIso();
        await db.workoutSets.update(setId, { deletedAt: ts, updatedAt: ts });
        await recalcTotals(current.workoutId);
      });
    },

    async softDeleteWorkout(id) {
      await db.transaction('rw', db.workouts, db.plannedWorkouts, async () => {
        await base.remove(id);
        const linked = (await db.plannedWorkouts.toArray()).filter(
          (p) => p.workoutId === id && !p.deletedAt,
        );
        for (const plan of linked)
          await db.plannedWorkouts.update(plan.id, {
            status: 'planned',
            // Retain the tombstone link for Undo; starting again replaces it atomically.
            updatedAt: nowIso(),
          });
      });
    },

    async restoreWorkout(id) {
      await db.transaction('rw', db.workouts, db.plannedWorkouts, async () => {
        await base.restore(id);
        const workout = await db.workouts.get(id);
        const linked = (await db.plannedWorkouts.toArray()).filter(
          (p) => p.workoutId === id && !p.deletedAt,
        );
        for (const plan of linked)
          await db.plannedWorkouts.update(plan.id, {
            status: workout?.finishedAt ? 'completed' : 'started',
            updatedAt: nowIso(),
          });
      });
    },

    async finishWorkout(id, patch) {
      await db.transaction('rw', db.workoutSets, db.workouts, db.plannedWorkouts, async () => {
        const sets = (await db.workoutSets.where('workoutId').equals(id).toArray()).filter(
          (s) => !s.deletedAt,
        );
        await db.workouts.update(id, {
          finishedAt: nowIso(),
          ...recalcWorkoutTotals(sets),
          ...(patch?.feelRating ? { feelRating: patch.feelRating } : {}),
          ...(patch?.notes != null ? { notes: patch.notes } : {}),
          updatedAt: nowIso(),
        });
        // Связанный план переходит в «выполнен».
        const plans = (await db.plannedWorkouts.toArray()).filter((p) => !p.deletedAt);
        const linked = plans.find((p) => p.workoutId === id);
        if (linked) {
          await db.plannedWorkouts.update(linked.id, {
            status: 'completed',
            updatedAt: nowIso(),
          });
        }
      });
    },
  };
}

function makePlannedWorkoutRepo(db: LentaDB): PlannedWorkoutRepo {
  const base = crud<PlannedWorkout>(db.plannedWorkouts);
  return {
    ...base,
    async byDate(date) {
      return (await db.plannedWorkouts.where('plannedDate').equals(date).toArray()).filter(
        (p) => !p.deletedAt,
      );
    },
    async byDateRange(from, to) {
      return (
        await db.plannedWorkouts.where('plannedDate').between(from, to, true, true).toArray()
      ).filter((p) => !p.deletedAt);
    },
    async upcoming(today) {
      return upcomingPlan(await base.all(), today);
    },
    async overdue(today) {
      return overduePlans(await base.all(), today);
    },
    async reschedule(id, newDate, shiftFollowing) {
      const plans = await base.all();
      const next = reschedulePlans(plans, id, newDate, shiftFollowing);
      const ts = nowIso();
      const changed = next.filter((p, i) => p.plannedDate !== plans[i]?.plannedDate);
      if (changed.length) {
        await db.plannedWorkouts.bulkPut(changed.map((p) => ({ ...p, updatedAt: ts })));
      }
    },
    async setStatus(id, status, workoutId) {
      await db.plannedWorkouts.update(id, {
        status,
        ...(workoutId !== undefined ? { workoutId } : {}),
        updatedAt: nowIso(),
      });
    },
  };
}

function makeWorkoutSetRepo(db: LentaDB): WorkoutSetRepo {
  const base = crud<WorkoutSet>(db.workoutSets);
  return {
    ...base,
    async ensureInitial(data) {
      await db.transaction('rw', db.workoutSets, async () => {
        const existing = await db.workoutSets.where('workoutId').equals(data.workoutId).toArray();
        if (!existing.some((set) => set.exerciseId === data.exerciseId && !set.deletedAt))
          await base.create(data);
      });
    },
    async byWorkout(workoutId) {
      return (await db.workoutSets.where('workoutId').equals(workoutId).toArray())
        .filter((s) => !s.deletedAt)
        .sort((a, b) => a.order - b.order);
    },
    async byExercise(exerciseId, limit) {
      const rows = (await db.workoutSets.where('exerciseId').equals(exerciseId).toArray())
        .filter((s) => !s.deletedAt)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return limit ? rows.slice(0, limit) : rows;
    },
    async lastSessionSets(exerciseId, excludeWorkoutId) {
      // Индекс [exerciseId+order] делает это мгновенным — требование 6.5.
      const rows = (await db.workoutSets.where('exerciseId').equals(exerciseId).toArray()).filter(
        (s) => !s.deletedAt && s.workoutId !== excludeWorkoutId && s.isCompleted,
      );
      if (rows.length === 0) return [];
      const workoutIds = [...new Set(rows.map((r) => r.workoutId))];
      // Удалённые тренировки не должны подставляться как «прошлый раз».
      const workouts = (await db.workouts.bulkGet(workoutIds)).filter(
        (w): w is Workout => w != null && !w.deletedAt,
      );
      const latest = workouts
        .filter((w) => w.finishedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      if (!latest) return [];
      return rows.filter((r) => r.workoutId === latest.id).sort((a, b) => a.order - b.order);
    },
    async recentTopWeights(exerciseId, sessions) {
      const rows = (await db.workoutSets.where('exerciseId').equals(exerciseId).toArray()).filter(
        (s) => !s.deletedAt && s.isCompleted && s.type !== 'warmup',
      );
      const byWorkout = new Map<string, number>();
      for (const r of rows) {
        byWorkout.set(r.workoutId, Math.max(byWorkout.get(r.workoutId) ?? 0, r.weightKg));
      }
      const workouts = (await db.workouts.bulkGet([...byWorkout.keys()])).filter(
        (w): w is Workout => w != null && !w.deletedAt,
      );
      return workouts
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, sessions)
        .map((w) => byWorkout.get(w.id) ?? 0);
    },
  };
}

function makeExerciseRepo(db: LentaDB): ExerciseRepo {
  const base = crud<Exercise>(db.exercises);
  return {
    ...base,
    async search(query, limit = 60) {
      const all = await base.all();
      const tokens = tokenize(query);
      const filtered = query.trim() ? all.filter((e) => matches(e.searchKey, tokens)) : all;
      return filtered
        .sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
          if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .slice(0, limit);
    },
    async byMuscle(muscle) {
      return (await db.exercises.where('primaryMuscles').equals(muscle).toArray()).filter(
        (e) => !e.deletedAt,
      );
    },
    async toggleFavorite(id) {
      const ex = await db.exercises.get(id);
      if (!ex) return;
      await db.exercises.update(id, {
        isFavorite: !ex.isFavorite,
        updatedAt: nowIso(),
      });
    },
  };
}

function makeBodyRepo(db: LentaDB): BodyRepo {
  const base = crud<BodyMetric>(db.body);
  return {
    ...base,
    async byDate(date) {
      const rows = (await db.body.where('date').equals(date).toArray()).filter((r) => !r.deletedAt);
      return rows[0];
    },
    async byDateRange(from, to) {
      return (await db.body.where('date').between(from, to, true, true).toArray())
        .filter((r) => !r.deletedAt)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    async latestWeight() {
      const rows = (await base.all())
        .filter((r) => r.weightKg != null)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = rows[0];
      return latest ? { date: latest.date, weightKg: latest.weightKg as number } : undefined;
    },
    async lastMeasurementDate() {
      const rows = (await base.all())
        .filter((r) => r.measurements && Object.keys(r.measurements).length > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
      return rows[0]?.date;
    },
  };
}

function makeDatedRepo<T extends HasBase & { date: LocalDate }>(
  table: Table<T, string>,
): DatedRepo<T> {
  const base = crud<T>(table);
  return {
    ...base,
    async byDate(date) {
      const rows = (await table.where('date').equals(date).toArray()).filter((r) => !r.deletedAt);
      return rows[0];
    },
    async byDateRange(from, to) {
      return (await table.where('date').between(from, to, true, true).toArray())
        .filter((r) => !r.deletedAt)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

function makeHabitLogRepo(db: LentaDB): HabitLogRepo {
  const base = crud<HabitLog>(db.habitLogs);
  return {
    ...base,
    async byDate(date) {
      return (await db.habitLogs.where('date').equals(date).toArray()).filter((r) => !r.deletedAt);
    },
    async byDateRange(from, to) {
      return (await db.habitLogs.where('date').between(from, to, true, true).toArray()).filter(
        (r) => !r.deletedAt,
      );
    },
    async byHabit(habitId) {
      return (await db.habitLogs.where('habitId').equals(habitId).toArray()).filter(
        (r) => !r.deletedAt,
      );
    },
    async toggle(habitId, date, value) {
      const existing = (
        await db.habitLogs.where('[habitId+date]').equals([habitId, date]).toArray()
      ).filter((r) => !r.deletedAt)[0];
      const ts = nowIso();
      if (existing) {
        await db.habitLogs.update(existing.id, {
          completed: value != null ? true : !existing.completed,
          value: value ?? existing.value,
          updatedAt: ts,
        });
      } else {
        await db.habitLogs.put({
          id: uuid(),
          habitId,
          date,
          completed: true,
          value,
          createdAt: ts,
          updatedAt: ts,
        });
      }
    },
  };
}

function makeSettingsRepo(db: LentaDB): SettingsRepo {
  return {
    /**
     * Только чтение. Отсутствующую строку НЕ создаём: get() вызывается из
     * реактивных запросов, а запись внутри них запрещена. Значения по умолчанию
     * возвращаются как есть и материализуются при первом update().
     */
    async get() {
      const row = await db.settings.get('singleton');
      return row ? { ...defaultSettings(), ...row } : defaultSettings();
    },
    async update(patch) {
      const current = await this.get();
      const next: Settings = {
        ...current,
        ...patch,
        id: 'singleton',
        updatedAt: nowIso(),
      };
      await db.settings.put(next);
      return next;
    },
  };
}

function makeProfileRepo(db: LentaDB): ProfileRepo {
  return {
    async get() {
      const rows = await db.profile.toArray();
      return rows[0];
    },
    async save(profile) {
      const existing = (await db.profile.toArray())[0];
      const ts = nowIso();
      const next: Profile = {
        ...(existing ?? {}),
        ...profile,
        id: profile.id || existing?.id || uuid(),
        createdAt: existing?.createdAt ?? ts,
        updatedAt: ts,
      } as Profile;
      await db.profile.put(next);
      return next;
    },
  };
}

function makeGameRepo(db: LentaDB): GameRepo {
  const blank = (): GameState => ({
    id: 'singleton',
    xp: 0,
    level: 1,
    freezes: 0,
    streaks: {},
    unlockedAchievements: [],
    updatedAt: nowIso(),
  });

  return {
    /** Только чтение — см. пояснение в makeSettingsRepo. */
    async get() {
      return (await db.gameState.get('singleton')) ?? blank();
    },
    async update(patch) {
      const current = await this.get();
      const next: GameState = {
        ...current,
        ...patch,
        id: 'singleton',
        updatedAt: nowIso(),
      };
      next.level = levelForXp(next.xp);
      await db.gameState.put(next);
      return next;
    },
    async awardXp({ reason, amount, date, dedupeKey }) {
      const existing = await db.xpEvents.where('dedupeKey').equals(dedupeKey).first();
      if (existing) return false;
      const ts = nowIso();
      const event: XpEvent = {
        id: uuid(),
        date,
        reason,
        amount,
        dedupeKey,
        createdAt: ts,
        updatedAt: ts,
      };
      await db.xpEvents.put(event);
      const state = await this.get();
      await this.update({ xp: state.xp + amount });
      return true;
    },
    async events(limit = 50) {
      const rows = await db.xpEvents.toArray();
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
  };
}

function makeBlobRepo(db: LentaDB): BlobRepo {
  return {
    async get(id) {
      return db.blobs.get(id);
    },
    async put(blob, mime, id) {
      const key = id ?? uuid();
      await db.blobs.put({ id: key, mime, data: blob, createdAt: nowIso() });
      return key;
    },
    async remove(id) {
      await db.blobs.delete(id);
    },
    async all() {
      return db.blobs.toArray();
    },
  };
}

function makeMetaRepo(db: LentaDB): MetaRepo {
  return {
    async get<T>(key: string) {
      const row = await db.meta.get(key);
      return row?.value as T | undefined;
    },
    async set(key, value) {
      await db.meta.put({ key, value });
    },
  };
}

/** Собирает полный набор репозиториев для профиля. */
export function createRepositories(profileId: string): Repositories {
  const db = openDb(profileId);

  return {
    profileId,
    profile: makeProfileRepo(db),
    settings: makeSettingsRepo(db),
    foods: makeFoodRepo(db),
    dishes: crud<Dish>(db.dishes),
    recipes: crud<Recipe>(db.recipes),
    diary: makeDiaryRepo(db),
    water: makeWaterRepo(db),
    fasting: crud<FastingSession>(db.fasting),
    substances: {
      ...crud<SubstanceEntry>(db.substances),
      async byDate(date) {
        return (await db.substances.where('date').equals(date).toArray()).filter(
          (r) => !r.deletedAt,
        );
      },
      async byDateRange(from, to) {
        return (await db.substances.where('date').between(from, to, true, true).toArray()).filter(
          (r) => !r.deletedAt,
        );
      },
    },
    mealPlans: {
      ...crud<MealPlan>(db.mealPlans),
      async byWeek(weekStart) {
        const rows = (await db.mealPlans.where('weekStart').equals(weekStart).toArray()).filter(
          (r) => !r.deletedAt,
        );
        return rows[0];
      },
    },
    shoppingLists: crud<ShoppingList>(db.shoppingLists),
    dayTemplates: crud<DayTemplate>(db.dayTemplates),
    exercises: makeExerciseRepo(db),
    routines: crud<Routine>(db.routines),
    workouts: makeWorkoutRepo(db),
    workoutSets: makeWorkoutSetRepo(db),
    plannedWorkouts: makePlannedWorkoutRepo(db),
    cardio: {
      ...crud<CardioSession>(db.cardio),
      async byDateRange(from, to) {
        return (await db.cardio.where('date').between(from, to, true, true).toArray()).filter(
          (r) => !r.deletedAt,
        );
      },
    },
    body: makeBodyRepo(db),
    sleep: makeDatedRepo<SleepLog>(db.sleep),
    checkins: makeDatedRepo<DailyCheckin>(db.checkins),
    habits: crud<Habit>(db.habits),
    habitLogs: makeHabitLogRepo(db),
    game: makeGameRepo(db),
    blobs: makeBlobRepo(db),
    meta: makeMetaRepo(db),
  };
}

/** Текущая дата — вынесено, чтобы репозитории не тянули лишнего. */
export const currentDate = today;

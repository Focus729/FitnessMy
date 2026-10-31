import { toDisplay, unitKey } from '@/lib/units';
/**
 * Экран активной тренировки — раздел 10.1.
 *
 * Оптимизирован под S2: телефон в руке, в зале, между подходами, без сети,
 * часто одной рукой. Целевое время отметки подхода — 4 секунды.
 *
 * Ключевое: колонка «предыдущий раз» заполнена данными последней тренировки
 * этого упражнения, а поля веса и повторов ПРЕДЗАПОЛНЕНЫ теми же значениями —
 * в типичном случае остаётся нажать галочку (одно нажатие).
 *
 * Состояние пишется в IndexedDB после каждого действия: закрытие вкладки,
 * разрядка телефона и перезагрузка тренировку не теряют.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { useSaveAction } from '@/app/useSaveAction';
import { award } from '@/app/gamification';
import type { Exercise, SetType, WorkoutSet } from '@/domain/model';
import { personalRecords, rirFromRpe } from '@/domain/training/oneRm';
import { recalcWorkoutTotals } from '@/domain/training/aggregates';
import { prefillFromLast, suggestProgression } from '@/domain/training/progression';
import { planPlates, summarizePlates } from '@/domain/training/plates';
import { durationShort, num } from '@/lib/format';
import { uuid } from '@/lib/id';
import { Button, Segmented, Sheet, TextField } from '@/design-system/primitives';
import { RestTimer } from '@/components/RestTimer';
import { SetsTable } from '@/components/SetsTable';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

export function ActiveWorkoutScreen() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const repos = useRepos();
  const settings = useSettings();

  const workout = useQuery(
    (r) => (workoutId ? r.workouts.get(workoutId) : Promise.resolve(undefined)),
    [workoutId],
  );
  const sets = useQueryWithDefault(
    (r) => (workoutId ? r.workoutSets.byWorkout(workoutId) : Promise.resolve([])),
    EMPTY,
    [workoutId],
  );
  const exercises = useQueryWithDefault((r) => r.exercises.all(), EMPTY);
  const routine = useQuery(
    (r) => (workout?.routineId ? r.routines.get(workout.routineId) : Promise.resolve(undefined)),
    [workout?.routineId],
  );

  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const timerKey = `lenta.rest.${repos.profileId}.${workoutId}`;
  const [restDeadline, setRestDeadline] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(timerKey));
    return Number.isFinite(saved) && saved > Date.now() ? saved : null;
  });
  const setRest = (deadline: number | null) => {
    setRestDeadline(deadline);
    if (deadline == null) localStorage.removeItem(timerKey);
    else localStorage.setItem(timerKey, String(deadline));
  };
  const finishing = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [plateFor, setPlateFor] = useState<{
    weightKg: number;
    barKg: number;
  } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  /** Упражнения, добавленные сверх программы прямо в зале (задача 4, пункт 2). */
  const [offPlanOpen, setOffPlanOpen] = useState(false);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const order = useMemo(() => workout?.exerciseOrder ?? EMPTY, [workout?.exerciseOrder]);

  useEffect(() => {
    if (openExerciseId == null && order.length > 0) setOpenExerciseId(order[0] as string);
  }, [order, openExerciseId]);

  const addExercise = async (exercise: Exercise) => {
    if (!workout) return;
    await repos.workouts.update(workout.id, {
      exerciseOrder: [...order.filter((id) => id !== exercise.id), exercise.id],
    });
    setOpenExerciseId(exercise.id);
  };

  /** Упражнения, заложенные программой на этот день. */
  const plannedExerciseIds = useMemo(() => {
    const day = routine?.days.find((d) => d.id === workout?.routineDayId);
    return (day?.items ?? []).map((i) => i.exerciseId);
  }, [routine, workout?.routineDayId]);
  // Derive from persisted order so reload does not lose the routine-review prompt.
  const addedOffPlan = routine ? order.filter((id) => !plannedExerciseIds.includes(id)) : [];

  /** Закрепить добавленные упражнения в программе — по явному согласию. */
  const keepInRoutine = async () => {
    if (!routine || !workout?.routineDayId) return;
    await repos.routines.update(routine.id, {
      days: routine.days.map((day) =>
        day.id !== workout.routineDayId
          ? day
          : {
              ...day,
              items: [
                ...day.items,
                ...addedOffPlan.map((exerciseId, i) => ({
                  id: uuid(),
                  exerciseId,
                  order: day.items.length + i,
                  targetSets: 3,
                  targetRepsMin: 6,
                  targetRepsMax: 10,
                  restSec: settings.restTimer.defaultSec,
                })),
              ],
            },
      ),
    });
    setOffPlanOpen(false);
    navigate('/gym');
  };

  /** Отвязать тренировку от программы — дальше правится как свободная. */
  const unlinkFromRoutine = async () => {
    if (!workout) return;
    await repos.workouts.updateWorkout(workout.id, {
      routineId: undefined,
      routineDayId: undefined,
    });
  };

  const finish = async (feel?: 1 | 2 | 3 | 4 | 5) => {
    if (!workout || finishing.current) return;
    finishing.current = true;
    setSaveError(false);
    try {
      await repos.workouts.finishWorkout(workout.id, feel ? { feelRating: feel } : undefined);
      setRest(null);
      await award(repos, 'workoutFinished', workout.date, workout.id);
      // Если во время тренировки добавляли упражнения не из программы —
      // предложим закрепить их в программе (задача 4, пункт 2).
      if (workout.routineId && addedOffPlan.length > 0) setOffPlanOpen(true);
      else navigate('/gym');
    } catch {
      setSaveError(true);
    } finally {
      finishing.current = false;
    }
  };

  if (!workout) return null;

  const elapsedSec = Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-28 pt-3">
      {saveError ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {restDeadline != null ? (
        <RestTimer
          key={restDeadline}
          deadline={restDeadline}
          onDeadlineChange={setRest}
          vibrate={settings.restTimer.vibrate}
          sound={settings.restTimer.sound}
          onClose={() => setRest(null)}
        />
      ) : null}

      <header className="flex items-center justify-between">
        <button
          type="button"
          className="tappable text-muted"
          aria-label={t('common.back')}
          onClick={() => navigate('/gym')}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1 className="text-section">{workout.name}</h1>
        <span className="tnum text-caption text-muted">{durationShort(elapsedSec)}</span>
      </header>
      <p className="mt-3 text-caption text-muted">
        {t('gym.sets', { count: sets.filter((set) => set.isCompleted).length })} / {sets.length}
      </p>
      <progress
        className="workout-progress mt-2 w-full"
        aria-label={t('gym.workouts')}
        value={sets.filter((set) => set.isCompleted).length}
        max={Math.max(1, sets.length)}
      />
      <TextField
        className="mt-3"
        value={workout.notes ?? ''}
        aria-label={t('common.note')}
        placeholder={t('common.note')}
        onChange={(notes) => {
          void repos.workouts.updateWorkout(workout.id, { notes }).catch(() => setSaveError(true));
        }}
      />

      <ul className="mt-4 space-y-3">
        {order.map((exerciseId, exerciseIndex) => {
          const exercise = byId.get(exerciseId);
          if (!exercise) return null;
          const open = openExerciseId === exerciseId;
          const exerciseSets = sets.filter((s) => s.exerciseId === exerciseId);

          return (
            <li key={exerciseId} className="card overflow-hidden">
              <button
                type="button"
                className="flex min-h-touch w-full items-center gap-2 px-3 text-left"
                onClick={() => setOpenExerciseId(open ? null : exerciseId)}
              >
                <span className="min-w-0 flex-1 truncate text-section">
                  {exercise.nameI18n?.ru && settings.locale === 'ru'
                    ? exercise.nameI18n.ru
                    : exercise.name}
                </span>
                <span className="tnum text-caption text-muted">
                  {exerciseSets.filter((s) => s.isCompleted).length}/{exerciseSets.length || '—'}
                </span>
              </button>

              {open ? (
                <>
                  <ExercisePanel
                    workoutId={workout.id}
                    exercise={exercise}
                    sets={exerciseSets}
                    onRest={(sec) => setRest(Date.now() + sec * 1000)}
                    onPlates={(weightKg) =>
                      setPlateFor({
                        weightKg,
                        barKg: exercise.barWeightKg ?? settings.plates.barKg,
                      })
                    }
                  />
                  {order[exerciseIndex + 1] ? (
                    <Button
                      full
                      className="mb-3"
                      onClick={() => setOpenExerciseId(order[exerciseIndex + 1] as string)}
                    >
                      {t('common.next')} · {byId.get(order[exerciseIndex + 1] as string)?.name}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        <Button full onClick={() => setPickerOpen(true)}>
          {t('gym.addExercise')}
        </Button>
        <Button variant="primary" full onClick={() => setFinishOpen(true)}>
          {t('gym.finishWorkout')}
        </Button>
        {workout.routineId ? (
          <Button variant="ghost" full onClick={() => void unlinkFromRoutine()}>
            {t('gym.unlinkRoutine')}
          </Button>
        ) : null}
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recentIds={order}
        onPick={(exercise) => {
          void addExercise(exercise);
          setPickerOpen(false);
        }}
      />

      <PlateSheet
        plan={plateFor}
        available={settings.plates.availableKg}
        onClose={() => setPlateFor(null)}
      />

      <Sheet
        open={offPlanOpen}
        onClose={() => {
          setOffPlanOpen(false);
          navigate('/gym');
        }}
        title={t('gym.offPlanTitle')}
      >
        <p className="text-body text-muted">{t('gym.offPlanBody')}</p>
        <ul className="mt-2 text-caption text-muted">
          {addedOffPlan.map((id) => (
            <li key={id}>{byId.get(id)?.name ?? id}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            full
            onClick={() => {
              setOffPlanOpen(false);
              navigate('/gym');
            }}
          >
            {t('gym.offPlanOnce')}
          </Button>
          <Button full onClick={() => void keepInRoutine()}>
            {t('gym.offPlanKeep')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title={t('gym.finishWorkout')}>
        <p className="tnum text-caption text-muted">
          {t('gym.finishSummary', {
            sets: t('gym.sets', { count: recalcWorkoutTotals(sets).totalSets }),
            volume: num(
              toDisplay(recalcWorkoutTotals(sets).totalVolumeKg, 'mass', settings.units),
              1,
            ),
            unit: t(`units.${unitKey('mass', settings.units)}`),
            duration: durationShort(elapsedSec),
          })}
        </p>
        <div className="mt-4">
          <div className="text-label uppercase text-muted">{t('gym.feelRating')}</div>
          <div className="mt-1">
            <Segmented
              ariaLabel={t('gym.feelRating')}
              value={0}
              options={[1, 2, 3, 4, 5].map((v) => ({
                value: v,
                label: String(v),
              }))}
              onChange={(v) => void finish(v as 1 | 2 | 3 | 4 | 5)}
            />
          </div>
        </div>
        <Button variant="primary" full className="mt-4" onClick={() => void finish()}>
          {t('common.finish')}
        </Button>
      </Sheet>
    </div>
  );
}

/* ─────────────────────── Таблица подходов упражнения ───────────────────────── */

function ExercisePanel({
  workoutId,
  exercise,
  sets,
  onRest,
  onPlates,
}: {
  workoutId: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  onRest: (sec: number) => void;
  onPlates: (weightKg: number) => void;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();

  const loadedLastSets = useQuery(
    (r) => r.workoutSets.lastSessionSets(exercise.id, workoutId),
    [exercise.id, workoutId],
  );
  const lastSets = loadedLastSets ?? EMPTY;
  const recentTopWeights = useQueryWithDefault(
    (r) => r.workoutSets.recentTopWeights(exercise.id, 3),
    EMPTY,
    [exercise.id],
  );

  const advice = useMemo(
    () =>
      suggestProgression({
        lastSets,
        targetRepsMin: 6,
        targetRepsMax: 10,
        bodyPart: exercise.bodyPart ?? 'upper',
        recentTopWeights,
      }),
    [lastSets, exercise.bodyPart, recentTopWeights],
  );
  const saving = useSaveAction();

  // Автоматически создаём первый подход с предзаполненными значениями.
  const ensureSet = useCallback(async () => {
    if (sets.length > 0 || loadedLastSets === undefined) return;
    const prefill = prefillFromLast(lastSets, 0);
    await repos.workoutSets.ensureInitial({
      workoutId,
      exerciseId: exercise.id,
      order: 0,
      weightKg: prefill?.weightKg ?? 0,
      reps: prefill?.reps ?? 0,
      type: 'normal',
      isCompleted: false,
      estimated1RM: 0,
    });
  }, [sets.length, lastSets, loadedLastSets, repos, workoutId, exercise.id]);

  useEffect(() => {
    void saving.run(ensureSet);
    // ensureInitial is atomic even across StrictMode mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureSet]);

  const addSet = async (type: SetType = 'normal') => {
    const index = sets.length;
    const prefill = prefillFromLast(lastSets, index);
    const previous = sets[sets.length - 1];
    await repos.workoutSets.create({
      workoutId,
      exerciseId: exercise.id,
      order: index,
      weightKg: previous?.weightKg ?? prefill?.weightKg ?? 0,
      reps: previous?.reps ?? prefill?.reps ?? 0,
      type,
      isCompleted: false,
      estimated1RM: 0,
    });
  };

  /** Отметка подхода: одно нажатие. Таймер отдыха стартует автоматически (C2-б). */
  const complete = async (set: WorkoutSet) => {
    const next = !set.isCompleted;
    // Агрегаты пересчитывает репозиторий — компонент их не считает (задача 1).
    await repos.workouts.updateSet(set.id, { isCompleted: next });
    if (next) onRest(exercise.defaultRestSec ?? settings.restTimer.defaultSec);
  };

  const records = personalRecords(lastSets);

  return (
    <div className="px-3 pb-3">
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {/* Подсказка прогрессии — строкой, не модальным окном (10.3) */}
      {advice.kind !== 'noData' ? (
        <p className="mb-2 text-caption text-muted">
          {advice.kind === 'deload'
            ? t('gym.progressionHint.deload', {
                weight: num(toDisplay(advice.toKg, 'mass', settings.units), 1),
                unit: t(`units.${unitKey('mass', settings.units)}`),
              })
            : t(`gym.progressionHint.${advice.kind}`, {
                prev: lastSets
                  .filter((s) => s.type !== 'warmup')
                  .map((s) => `${num(toDisplay(s.weightKg, 'mass', settings.units), 1)}×${s.reps}`)
                  .join(', '),
                weight: num(
                  toDisplay(
                    advice.kind === 'increaseWeight' ? advice.toKg : advice.weightKg,
                    'mass',
                    settings.units,
                  ),
                  1,
                ),
                unit: t(`units.${unitKey('mass', settings.units)}`),
                reps: advice.kind === 'repeat' ? '' : advice.reps,
              })}
        </p>
      ) : null}

      <SetsTable
        mode="active"
        sets={sets}
        lastSets={lastSets}
        onChangeSet={(setId, patch) => {
          void repos.workouts.updateSet(setId, patch).catch(() =>
            saving.run(async () => {
              throw new Error('write');
            }),
          );
        }}
        onToggleComplete={(set) => void saving.run(() => complete(set))}
        onAddSet={(type) => void saving.run(() => addSet(type))}
        onPlates={onPlates}
      />

      {records.max1RM > 0 ? (
        <p className="tnum mt-2 text-caption text-muted">
          {t('gym.oneRmEstimate', {
            unit: t(`units.${unitKey('mass', settings.units)}`),
            value: num(toDisplay(records.max1RM, 'mass', settings.units), 1),
          })}
          {sets.some((s) => s.rpe != null)
            ? ` · ${t('gym.rir', { value: rirFromRpe(sets.find((s) => s.rpe != null)?.rpe ?? 10) })}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}

/* ─────────────────────── Плита-калькулятор (C2-е) ──────────────────────────── */

function PlateSheet({
  plan,
  available,
  onClose,
}: {
  plan: { weightKg: number; barKg: number } | null;
  available: number[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  if (!plan) return null;

  const result = planPlates(plan.weightKg, plan.barKg, available);
  const summary = summarizePlates(result.perSide);

  return (
    <Sheet open onClose={onClose} title={t('gym.plateTitle')}>
      <p className="tnum text-caption text-muted">
        {t('gym.plateBar', {
          unit: t(`units.${unitKey('mass', settings.units)}`),
          kg: num(toDisplay(plan.barKg, 'mass', settings.units), 1),
        })}
      </p>
      <div className="tnum mt-3 text-display">
        {num(toDisplay(result.achievableKg, 'mass', settings.units), 1)}
      </div>
      <div className="text-caption text-muted">{t(`units.${unitKey('mass', settings.units)}`)}</div>

      <div className="mt-4 text-label uppercase text-muted">{t('gym.platePerSide')}</div>
      <ul className="tnum mt-2 flex flex-wrap gap-2">
        {summary.map((s) => (
          <li key={s.plate} className="rounded-lg border border-hairline px-3 py-2 text-num">
            {num(toDisplay(s.plate, 'mass', settings.units), 1)} × {s.count}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-caption text-muted">
        {result.exact
          ? t('gym.plateExact')
          : t('gym.plateNearest', {
              unit: t(`units.${unitKey('mass', settings.units)}`),
              kg: num(toDisplay(result.achievableKg, 'mass', settings.units), 1),
            })}
      </p>
    </Sheet>
  );
}

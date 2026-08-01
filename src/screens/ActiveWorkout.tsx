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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { award } from '@/app/gamification';
import type { Exercise, SetType, WorkoutSet } from '@/domain/model';
import { epley1RM, personalRecords, totalVolume, countWorkingSets, rirFromRpe } from '@/domain/training/oneRm';
import { prefillFromLast, suggestProgression } from '@/domain/training/progression';
import { planPlates, summarizePlates } from '@/domain/training/plates';
import { durationShort, num } from '@/lib/format';
import { nowIso } from '@/lib/date';
import { Button, NumberField, Segmented, Sheet } from '@/design-system/primitives';
import { RestTimer } from '@/components/RestTimer';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

export function ActiveWorkoutScreen() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const repos = useRepos();
  const settings = useSettings();

  const workout = useQuery((r) => (workoutId ? r.workouts.get(workoutId) : Promise.resolve(undefined)), [workoutId]);
  const sets = useQueryWithDefault(
    (r) => (workoutId ? r.workoutSets.byWorkout(workoutId) : Promise.resolve([])),
    EMPTY,
    [workoutId],
  );
  const exercises = useQueryWithDefault((r) => r.exercises.all(), EMPTY);

  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [restSec, setRestSec] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [plateFor, setPlateFor] = useState<{ weightKg: number; barKg: number } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);

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

  const finish = async (feel?: 1 | 2 | 3 | 4 | 5) => {
    if (!workout) return;
    await repos.workouts.update(workout.id, {
      finishedAt: nowIso(),
      totalVolumeKg: totalVolume(sets),
      totalSets: countWorkingSets(sets),
      ...(feel ? { feelRating: feel } : {}),
    });
    await award(repos, 'workoutFinished', workout.date, workout.id);
    navigate('/gym');
  };

  if (!workout) return null;

  const elapsedSec = Math.floor((Date.now() - new Date(workout.startedAt).getTime()) / 1000);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-28 pt-3">
      {restSec != null ? (
        <RestTimer
          seconds={restSec}
          vibrate={settings.restTimer.vibrate}
          sound={settings.restTimer.sound}
          onClose={() => setRestSec(null)}
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

      <ul className="mt-4 space-y-3">
        {order.map((exerciseId) => {
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
                <ExercisePanel
                  workoutId={workout.id}
                  exercise={exercise}
                  sets={exerciseSets}
                  onRest={(sec) => setRestSec(sec)}
                  onPlates={(weightKg) =>
                    setPlateFor({
                      weightKg,
                      barKg: exercise.barWeightKg ?? settings.plates.barKg,
                    })
                  }
                />
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
      </div>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
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

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title={t('gym.finishWorkout')}>
        <p className="tnum text-caption text-muted">
          {t('gym.finishSummary', {
            sets: t('gym.sets', { count: countWorkingSets(sets) }),
            volume: num(totalVolume(sets)),
            duration: durationShort(elapsedSec),
          })}
        </p>
        <div className="mt-4">
          <div className="text-label uppercase text-muted">{t('gym.feelRating')}</div>
          <div className="mt-1">
            <Segmented
              ariaLabel={t('gym.feelRating')}
              value={0}
              options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) }))}
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

  const lastSets = useQueryWithDefault(
    (r) => r.workoutSets.lastSessionSets(exercise.id, workoutId),
    EMPTY,
    [exercise.id, workoutId],
  );
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

  // Автоматически создаём первый подход с предзаполненными значениями.
  const ensureSet = useCallback(async () => {
    if (sets.length > 0) return;
    const prefill = prefillFromLast(lastSets, 0);
    await repos.workoutSets.create({
      workoutId,
      exerciseId: exercise.id,
      order: 0,
      weightKg: prefill?.weightKg ?? 0,
      reps: prefill?.reps ?? 0,
      type: 'normal',
      isCompleted: false,
      estimated1RM: 0,
    });
  }, [sets.length, lastSets, repos, workoutId, exercise.id]);

  useEffect(() => {
    void ensureSet();
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
    await repos.workoutSets.update(set.id, {
      isCompleted: next,
      estimated1RM: epley1RM(set.weightKg, set.reps),
    });
    if (next) onRest(exercise.defaultRestSec ?? settings.restTimer.defaultSec);
  };

  const records = personalRecords(lastSets);

  return (
    <div className="px-3 pb-3">
      {/* Подсказка прогрессии — строкой, не модальным окном (10.3) */}
      {advice.kind !== 'noData' ? (
        <p className="mb-2 text-caption text-muted">
          {advice.kind === 'deload'
            ? t('gym.progressionHint.deload', { weight: num(advice.toKg) })
            : t(`gym.progressionHint.${advice.kind}`, {
                prev: lastSets
                  .filter((s) => s.type !== 'warmup')
                  .map((s) => `${num(s.weightKg)}×${s.reps}`)
                  .join(', '),
                weight: num(advice.kind === 'increaseWeight' ? advice.toKg : advice.weightKg),
                reps: advice.kind === 'repeat' ? '' : advice.reps,
              })}
        </p>
      ) : null}

      <table className="w-full text-caption">
        <thead>
          <tr className="text-label uppercase text-muted">
            <th className="w-6 text-left">#</th>
            <th className="text-left">{t('gym.previous')}</th>
            <th className="w-20 text-left">{t('gym.weight')}</th>
            <th className="w-16 text-left">{t('gym.reps')}</th>
            <th className="w-14 text-left">{t('gym.rpe')}</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {sets.map((set, i) => {
            const prev = lastSets.filter((s) => s.type !== 'warmup')[i];
            return (
              <tr key={set.id} className="align-middle">
                <td className="tnum text-muted">{i + 1}</td>
                <td className="tnum text-muted">
                  {prev
                    ? t('gym.prevFormat', { weight: num(prev.weightKg), reps: prev.reps })
                    : t('gym.noPrevious')}
                </td>
                <td className="py-1 pr-1">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onPlates(set.weightKg)}
                    aria-label={t('gym.plateTitle')}
                  >
                    <NumberField
                      value={set.weightKg}
                      onChange={(v) =>
                        void repos.workoutSets.update(set.id, { weightKg: v === '' ? 0 : v })
                      }
                      aria-label={t('gym.weight')}
                    />
                  </button>
                </td>
                <td className="py-1 pr-1">
                  <NumberField
                    value={set.reps}
                    onChange={(v) => void repos.workoutSets.update(set.id, { reps: v === '' ? 0 : v })}
                    aria-label={t('gym.reps')}
                  />
                </td>
                <td className="py-1 pr-1">
                  <NumberField
                    value={set.rpe ?? ''}
                    onChange={(v) => void repos.workoutSets.update(set.id, { rpe: v === '' ? undefined : v })}
                    aria-label={t('gym.rpe')}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={t('common.done')}
                    aria-pressed={set.isCompleted}
                    onClick={() => void complete(set)}
                    className={`tappable w-full justify-center rounded-lg border ${
                      set.isCompleted ? 'border-accent text-accent' : 'border-hairline text-muted'
                    }`}
                  >
                    <span aria-hidden="true">✓</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => void addSet('normal')}>{t('gym.addSet')}</Button>
        <Button onClick={() => void addSet('drop')}>{t('gym.addDrop')}</Button>
        <Button onClick={() => void addSet('warmup')}>{t('gym.setTypes.warmup')}</Button>
      </div>

      {records.max1RM > 0 ? (
        <p className="tnum mt-2 text-caption text-muted">
          {t('gym.oneRmEstimate', { value: num(records.max1RM) })}
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
  if (!plan) return null;

  const result = planPlates(plan.weightKg, plan.barKg, available);
  const summary = summarizePlates(result.perSide);

  return (
    <Sheet open onClose={onClose} title={t('gym.plateTitle')}>
      <p className="tnum text-caption text-muted">{t('gym.plateBar', { kg: num(plan.barKg) })}</p>
      <div className="tnum mt-3 text-display">{num(result.achievableKg)}</div>
      <div className="text-caption text-muted">{t('units.kg')}</div>

      <div className="mt-4 text-label uppercase text-muted">{t('gym.platePerSide')}</div>
      <ul className="tnum mt-2 flex flex-wrap gap-2">
        {summary.map((s) => (
          <li key={s.plate} className="rounded-lg border border-hairline px-3 py-2 text-num">
            {num(s.plate)} × {s.count}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-caption text-muted">
        {result.exact
          ? t('gym.plateExact')
          : t('gym.plateNearest', { kg: num(result.achievableKg) })}
      </p>
    </Sheet>
  );
}

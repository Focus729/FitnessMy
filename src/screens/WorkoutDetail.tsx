import { toDisplay, unitKey } from '@/lib/units';
/**
 * Просмотр и правка завершённой тренировки — задача 1 доработки 0.7.
 *
 * Раньше после «Завершить» тренировка становилась неизменяемой: опечатку в
 * весе исправить было нельзя, забытый подход добавить тоже.
 *
 * Здесь переиспользуется та же таблица подходов, что и в зале, но без таймера
 * отдыха и без подсказок прогрессии — они нужны только во время тренировки.
 * Все правки идут через репозиторий, который пересчитывает агрегаты.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import type { Exercise, SetType, WorkoutSet } from '@/domain/model';
import { volumeByExercise, workoutDurationSec } from '@/domain/training/aggregates';
import { durationShort, num } from '@/lib/format';
import {
  Button,
  MetricValue,
  Panel,
  SectionHeader,
  Sheet,
  TextField,
} from '@/design-system/primitives';
import { SetsTable } from '@/components/SetsTable';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';

const EMPTY: never[] = [];

export function WorkoutDetailScreen() {
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

  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const order = useMemo(() => workout?.exerciseOrder ?? EMPTY, [workout?.exerciseOrder]);
  const perExercise = useMemo(() => volumeByExercise(sets), [sets]);

  if (!workout) return null;

  const label = (exercise: Exercise | undefined, id: string) =>
    !exercise
      ? id
      : settings.locale === 'ru' && exercise.nameI18n?.ru
        ? exercise.nameI18n.ru
        : exercise.name;

  const addExercise = async (exercise: Exercise) => {
    await repos.workouts.updateWorkout(workout.id, {
      exerciseOrder: [...order.filter((id) => id !== exercise.id), exercise.id],
    });
    setPickerOpen(false);
  };

  const addSet = async (exerciseId: string, type: SetType) => {
    const existing = sets.filter((s) => s.exerciseId === exerciseId);
    const previous = existing[existing.length - 1];
    await repos.workouts.addSetToWorkout(workout.id, {
      workoutId: workout.id,
      exerciseId,
      order: existing.length,
      weightKg: previous?.weightKg ?? 0,
      reps: previous?.reps ?? 0,
      type,
      isCompleted: true,
      estimated1RM: 0,
    });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-4 pb-28 pt-3">
      <header className="flex items-center justify-between">
        <button
          type="button"
          className="tappable text-muted"
          aria-label={t('common.back')}
          onClick={() => navigate('/gym')}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h1 className="min-w-0 flex-1 truncate px-2 text-section">{workout.name}</h1>
        <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? t('common.done') : t('common.edit')}
        </Button>
      </header>

      <Panel title={t('common.total')}>
        <div className="grid grid-cols-3 gap-3">
          <MetricValue
            label={t('gym.volume')}
            value={num(toDisplay(workout.totalVolumeKg, 'mass', settings.units), 1)}
            unit={t(`units.${unitKey('mass', settings.units)}`)}
            size="lg"
          />
          <MetricValue label={t('gym.set')} value={workout.totalSets} size="lg" />
          <MetricValue
            label={t('gym.duration')}
            value={durationShort(workoutDurationSec(workout))}
            size="lg"
          />
        </div>
      </Panel>

      {editing ? (
        <Button full onClick={() => setMetaOpen(true)}>
          {t('gym.editMeta')}
        </Button>
      ) : null}

      <div className="space-y-3">
        {order.map((exerciseId) => {
          const exercise = byId.get(exerciseId);
          const exerciseSets = sets.filter((s) => s.exerciseId === exerciseId);
          const stats = perExercise.find((p) => p.exerciseId === exerciseId);

          return (
            <Panel key={exerciseId}>
              <SectionHeader
                title={label(exercise, exerciseId)}
                hint={
                  stats
                    ? `${num(toDisplay(stats.volumeKg, 'mass', settings.units), 1)} ${t(`units.${unitKey('mass', settings.units)}`)} · ${t('gym.sets', { count: stats.sets })}`
                    : undefined
                }
              />
              {editing ? (
                <SetsTable
                  mode="edit"
                  sets={exerciseSets}
                  onChangeSet={(setId, patch) => void repos.workouts.updateSet(setId, patch)}
                  onToggleComplete={(set: WorkoutSet) =>
                    void repos.workouts.updateSet(set.id, {
                      isCompleted: !set.isCompleted,
                    })
                  }
                  onRemoveSet={(setId) => void repos.workouts.removeSet(setId)}
                  onAddSet={(type) => void addSet(exerciseId, type)}
                />
              ) : (
                <ul className="tnum divide-y divide-hairline text-caption">
                  {exerciseSets.map((set, i) => (
                    <li key={set.id} className="flex items-center justify-between py-1">
                      <span className="text-muted">
                        {i + 1} · {t(`gym.setTypes.${set.type}`)}
                      </span>
                      <span>
                        {num(toDisplay(set.weightKg, 'mass', settings.units), 1)}{' '}
                        {t(`units.${unitKey('mass', settings.units)}`)} × {set.reps}
                        {set.rpe != null ? ` · ${t('gym.rpe')} ${set.rpe}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })}
      </div>

      {editing ? (
        <Button full onClick={() => setPickerOpen(true)}>
          {t('gym.addExercise')}
        </Button>
      ) : null}

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recentIds={order}
        onPick={(exercise) => void addExercise(exercise)}
      />

      <WorkoutMetaSheet
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        workoutId={workout.id}
        initial={{
          name: workout.name,
          date: workout.date,
          notes: workout.notes ?? '',
          feelRating: workout.feelRating,
        }}
      />
    </div>
  );
}

/** Название, дата, заметка и самочувствие. Дата нигде не кэшируется отдельно. */
function WorkoutMetaSheet({
  open,
  onClose,
  workoutId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  initial: {
    name: string;
    date: string;
    notes: string;
    feelRating?: 1 | 2 | 3 | 4 | 5;
  };
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.date);
  const [notes, setNotes] = useState(initial.notes);
  const [feel, setFeel] = useState<number | undefined>(initial.feelRating);

  const dirty =
    name !== initial.name ||
    date !== initial.date ||
    notes !== initial.notes ||
    feel !== initial.feelRating;

  const save = async () => {
    await repos.workouts.updateWorkout(workoutId, {
      name: name.trim() || initial.name,
      date,
      notes: notes.trim() || undefined,
      feelRating: feel as 1 | 2 | 3 | 4 | 5 | undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      dirty={dirty}
      onSave={() => void save()}
      title={t('gym.editMeta')}
      footer={
        <Button variant="primary" full onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <TextField value={name} onChange={setName} aria-label={t('common.name')} />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="tnum min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
          aria-label={t('common.date')}
        />
        <TextField
          value={notes}
          onChange={setNotes}
          aria-label={t('common.note')}
          placeholder={t('common.note')}
        />
        <div>
          <SectionHeader title={t('gym.feelRating')} />
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={feel === v}
                onClick={() => setFeel(feel === v ? undefined : v)}
                className={`tappable flex-1 justify-center rounded-lg border text-caption ${
                  feel === v ? 'border-accent text-accent' : 'border-hairline text-muted'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

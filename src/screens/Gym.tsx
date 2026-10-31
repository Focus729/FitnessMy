import { toDisplay, unitKey } from '@/lib/units';
/**
 * Вкладка «Зал» — тренировки, программы (10.2), упражнения (7.2),
 * кардио (10.4), история и рекорды (10.5).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useRouteState } from '@/app/navigation';
import { useSaveAction } from '@/app/useSaveAction';
import { MeasureField } from '@/components/MeasureField';
import { useRepos } from '@/data/repositories/context';
import { useQuery, useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { ROUTINE_TEMPLATES } from '@/data/seed/routines';
import type { Exercise, Routine } from '@/domain/model';
import { epley1RM, personalRecords } from '@/domain/training/oneRm';
import { estimateKcal } from '@/domain/training/met';
import type { CardioKind } from '@/domain/training/met';
import { today as todayFn, toLocalTime } from '@/lib/date';
import { dateShort, durationLong, num } from '@/lib/format';
import { uuid } from '@/lib/id';
import {
  Button,
  MetricValue,
  NumberField,
  Panel,
  SectionHeader,
  Segmented,
  Sheet,
  UndoToast,
} from '@/design-system/primitives';
import { ExercisePickerSheet } from '@/components/ExercisePickerSheet';
import { ExerciseImages } from '@/components/ExerciseImages';
import { PlanPanel } from '@/components/PlanPanel';
import { RoutineEditorSheet } from '@/components/RoutineEditorSheet';
import { SwipeToDelete } from '@/components/SwipeToDelete';

/** Стабильная пустая ссылка: не даёт зависимостям хуков меняться каждый рендер. */
const EMPTY: never[] = [];

type Section = 'workouts' | 'plan' | 'routines' | 'exercises' | 'cardio';

export function GymScreen() {
  const { t } = useTranslation();
  const [section, setSection] = useRouteState<Section>('section', 'workouts', [
    'workouts',
    'plan',
    'routines',
    'exercises',
    'cardio',
  ]);

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t('gym.title')}
        value={section}
        options={[
          { value: 'workouts' as const, label: t('gym.workouts') },
          { value: 'plan' as const, label: t('gym.plan') },
          { value: 'routines' as const, label: t('gym.routines') },
          { value: 'exercises' as const, label: t('gym.exercises') },
          { value: 'cardio' as const, label: t('gym.cardio') },
        ]}
        onChange={setSection}
      />
      {section === 'workouts' ? <Workouts /> : null}
      {section === 'plan' ? <PlanPanel /> : null}
      {section === 'routines' ? <Routines /> : null}
      {section === 'exercises' ? <ExerciseLibrary /> : null}
      {section === 'cardio' ? <Cardio /> : null}
    </div>
  );
}

/* ───────────────────────── История тренировок (10.5) ───────────────────────── */

function Workouts() {
  const settings = useSettings();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const repos = useRepos();
  const recent = useQuery((r) => r.workouts.recent(30)) ?? [];
  const unfinished = useQuery((r) => r.workouts.unfinished());
  const routines = useQuery((r) => r.routines.all()) ?? [];
  const [startOpen, setStartOpen] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const saving = useSaveAction();

  const startEmpty = async () => {
    const workout = await repos.workouts.startFree(t('gym.startEmpty'));
    navigate(`/workout/${workout.id}`);
  };

  const startFromRoutine = async (routine: Routine) => {
    const workout = await repos.workouts.startRoutine(routine.id);
    navigate(`/workout/${workout.id}`);
  };

  return (
    <div className="space-y-3">
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {unfinished ? (
        <Panel title={t('gym.unfinishedTitle')}>
          <p className="text-caption text-muted">
            {t('gym.unfinishedBody', { date: dateShort(unfinished.date) })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={() => navigate(`/workout/${unfinished.id}`)}>
              {t('common.continue')}
            </Button>
            <Button
              variant="danger"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(async () => {
                  await repos.workouts.softDeleteWorkout(unfinished.id);
                  setUndoId(unfinished.id);
                })
              }
            >
              {t('gym.discard')}
            </Button>
          </div>
        </Panel>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="primary"
          full
          disabled={saving.busy}
          onClick={() => void saving.run(startEmpty)}
        >
          {t('gym.startEmpty')}
        </Button>
        <Button full disabled={routines.length === 0} onClick={() => setStartOpen(true)}>
          {t('gym.startFromRoutine')}
        </Button>
      </div>

      {recent.length === 0 ? (
        <p className="py-6 text-body text-muted">{t('gym.noWorkouts')}</p>
      ) : (
        <ul className="space-y-1">
          {recent.map((w) => (
            <li key={w.id}>
              {/* Удаление — только свайпом, подтверждения нет: есть отмена (18.5) */}
              <SwipeToDelete
                deleteLabel={t('gym.deleteWorkout')}
                onDelete={() => {
                  void saving.run(async () => {
                    await repos.workouts.softDeleteWorkout(w.id);
                    setUndoId(w.id);
                  });
                }}
              >
                <button
                  type="button"
                  aria-label={t('gym.openWorkout')}
                  className="w-full rounded-xl px-1 py-2 text-left"
                  onClick={() => navigate(`/workout/${w.id}/view`)}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-body">{w.name}</span>
                    <span className="tnum text-caption text-muted">{dateShort(w.date)}</span>
                  </span>
                  <span className="tnum block text-caption text-muted">
                    {t('gym.sets', { count: w.totalSets })} · {t('gym.volume')}{' '}
                    {num(toDisplay(w.totalVolumeKg, 'mass', settings.units), 1)}{' '}
                    {t(`units.${unitKey('mass', settings.units)}`)}
                  </span>
                </button>
              </SwipeToDelete>
            </li>
          ))}
        </ul>
      )}

      {undoId ? (
        <UndoToast
          message={t('gym.workoutDeleted')}
          actionLabel={t('common.undo')}
          onAction={() => {
            void saving.run(async () => {
              await repos.workouts.restoreWorkout(undoId);
              setUndoId(null);
            });
          }}
          onExpire={() => setUndoId(null)}
        />
      ) : null}

      <Sheet open={startOpen} onClose={() => setStartOpen(false)} title={t('gym.startFromRoutine')}>
        <ul className="divide-y divide-hairline">
          {routines.map((routine) => (
            <li key={routine.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center py-2 text-left"
                onClick={() => {
                  setStartOpen(false);
                  void saving.run(() => startFromRoutine(routine));
                }}
              >
                <span className="flex-1 truncate text-body">{routine.name}</span>
                <span className="tnum text-caption text-muted">{routine.days.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ───────────────────────────── Программы (10.2) ────────────────────────────── */

function Routines() {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const routines = useQuery((r) => r.routines.all()) ?? [];
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [undoRoutine, setUndoRoutine] = useState<string | null>(null);
  /** Снимок программы до сброса — чтобы правки можно было вернуть (задача 4.4). */
  const [resetSnapshot, setResetSnapshot] = useState<Routine | null>(null);
  const saving = useSaveAction();

  /**
   * Возврат состава к исходному шаблону. Шаблон живёт константой в коде и
   * никогда не меняется, поэтому сброс всегда воспроизводим.
   */
  const resetToTemplate = async (routine: Routine) => {
    const template = ROUTINE_TEMPLATES.find((x) => x.key === routine.templateKey);
    if (!template) return;
    await repos.routines.update(routine.id, {
      days: template.days.map((day, i) => ({
        id: uuid(),
        name: settings.locale === 'ru' ? day.nameRu : day.nameEn,
        order: i,
        items: day.items.map((item, k) => ({
          id: uuid(),
          exerciseId: item.exerciseId,
          order: k,
          targetSets: item.targetSets,
          targetRepsMin: item.targetRepsMin,
          targetRepsMax: item.targetRepsMax,
          restSec: item.restSec,
          ...(item.supersetGroup ? { supersetGroup: item.supersetGroup } : {}),
        })),
      })),
    });
    setResetSnapshot(routine);
    setEditing(null);
  };

  const copyTemplate = async (key: string) => {
    const template = ROUTINE_TEMPLATES.find((x) => x.key === key);
    if (!template) return;
    // Шаблон копируется в программу пользователя; исходный не меняется (7.3).
    await repos.routines.create({
      name: settings.locale === 'ru' ? template.nameRu : template.nameEn,
      source: 'user',
      templateKey: template.key,
      nextDayIndex: 0,
      days: template.days.map((day, i) => ({
        id: uuid(),
        name: settings.locale === 'ru' ? day.nameRu : day.nameEn,
        order: i,
        items: day.items.map((item, k) => ({
          id: uuid(),
          exerciseId: item.exerciseId,
          order: k,
          targetSets: item.targetSets,
          targetRepsMin: item.targetRepsMin,
          targetRepsMax: item.targetRepsMax,
          restSec: item.restSec,
          ...(item.supersetGroup ? { supersetGroup: item.supersetGroup } : {}),
        })),
      })),
    });
    setTemplatesOpen(false);
  };

  return (
    <div className="space-y-3">
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      <Button full onClick={() => setTemplatesOpen(true)}>
        {t('gym.routineFromTemplate')}
      </Button>

      <ul className="divide-y divide-hairline">
        {routines.map((routine) => (
          <li key={routine.id} className="flex items-center gap-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setEditing(routine)}
            >
              <span className="block truncate text-body">{routine.name}</span>
              <span className="block text-caption text-muted">
                {routine.days.map((d) => d.name).join(' · ')}
              </span>
            </button>
            <Button variant="ghost" onClick={() => setEditing(routine)}>
              {t('common.edit')}
            </Button>
            <button
              type="button"
              aria-label={t('common.delete')}
              className="tappable justify-center px-2 text-muted"
              disabled={saving.busy}
              onClick={() =>
                void saving.run(async () => {
                  await repos.routines.remove(routine.id);
                  setUndoRoutine(routine.id);
                })
              }
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>

      <RoutineEditorSheet
        open={editing != null}
        routine={editing ?? undefined}
        onClose={() => setEditing(null)}
        onResetToTemplate={resetToTemplate}
      />

      {undoRoutine ? (
        <UndoToast
          message={t('common.deleted')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.routines.restore(undoRoutine);
              setUndoRoutine(null);
            })
          }
          onExpire={() => setUndoRoutine(null)}
        />
      ) : null}

      {resetSnapshot ? (
        <UndoToast
          message={t('gym.routineReset')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.routines.update(resetSnapshot.id, {
                name: resetSnapshot.name,
                days: resetSnapshot.days,
              });
              setResetSnapshot(null);
            })
          }
          onExpire={() => setResetSnapshot(null)}
        />
      ) : null}

      <Sheet
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title={t('gym.routineFromTemplate')}
      >
        <ul className="divide-y divide-hairline">
          {ROUTINE_TEMPLATES.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                className="w-full py-3 text-left"
                disabled={saving.busy}
                onClick={() => void saving.run(() => copyTemplate(template.key))}
              >
                <span className="block text-body">
                  {settings.locale === 'ru' ? template.nameRu : template.nameEn}
                </span>
                <span className="block text-caption text-muted">
                  {template.daysPerWeek} ·{' '}
                  {settings.locale === 'ru' ? template.audienceRu : template.audienceEn}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ───────────────────── Библиотека упражнений и рекорды ─────────────────────── */

function ExerciseLibrary() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [pickerOpen, setPickerOpen] = useState(true);

  return (
    <div>
      <ExercisePickerSheet
        open={pickerOpen && !selected}
        onClose={() => setPickerOpen(false)}
        onPick={(e) => setSelected(e)}
      />
      {!pickerOpen && !selected ? (
        <Button full onClick={() => setPickerOpen(true)}>
          {t('gym.exerciseSearch')}
        </Button>
      ) : null}
      {selected ? <ExerciseDetail exercise={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ExerciseDetail({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const sets = useQueryWithDefault((r) => r.workoutSets.byExercise(exercise.id, 200), EMPTY, [
    exercise.id,
  ]);
  const records = useMemo(() => personalRecords(sets), [sets]);

  const name =
    settings.locale === 'ru' && exercise.nameI18n?.ru ? exercise.nameI18n.ru : exercise.name;

  return (
    <Sheet open onClose={onClose} title={name}>
      <div className="text-caption text-muted">
        {exercise.primaryMuscles.map((m) => t(`muscles.${m}`, m)).join(', ')} ·{' '}
        {t(`equipment.${exercise.equipment}`, exercise.equipment)}
      </div>

      <div className="mt-3">
        <ExerciseImages imageIds={exercise.imageIds} />
      </div>

      {records.max1RM > 0 ? (
        <Panel title={t('gym.records')} className="mt-4">
          <div className="grid grid-cols-3 gap-3">
            <MetricValue
              label={t('gym.recordWeight')}
              value={num(toDisplay(records.maxWeightKg, 'mass', settings.units), 1)}
              unit={t(`units.${unitKey('mass', settings.units)}`)}
              size="lg"
            />
            <MetricValue label={t('gym.recordReps')} value={records.maxReps} size="lg" />
            <MetricValue
              label={t('gym.record1Rm')}
              value={num(toDisplay(records.max1RM, 'mass', settings.units), 1)}
              unit={t(`units.${unitKey('mass', settings.units)}`)}
              size="lg"
            />
          </div>
        </Panel>
      ) : null}

      {exercise.instructions.length > 0 ? (
        <div className="mt-4">
          <SectionHeader title={t('gym.instructions')} />
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-caption text-muted">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {sets.length > 0 ? (
        <div className="mt-4">
          <SectionHeader title={t('common.history')} />
          <ul className="tnum mt-1 divide-y divide-hairline text-caption">
            {sets.slice(0, 30).map((s) => (
              <li key={s.id} className="flex justify-between py-1">
                <span>
                  {num(toDisplay(s.weightKg, 'mass', settings.units), 1)}{' '}
                  {t(`units.${unitKey('mass', settings.units)}`)} × {s.reps}
                </span>
                <span className="text-muted">
                  {t('gym.oneRmEstimate', {
                    unit: t(`units.${unitKey('mass', settings.units)}`),
                    value: num(
                      toDisplay(
                        s.estimated1RM || epley1RM(s.weightKg, s.reps),
                        'mass',
                        settings.units,
                      ),
                      1,
                    ),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}

/* ───────────────────────────── Кардио (10.4) ───────────────────────────────── */

const CARDIO_KINDS: CardioKind[] = ['run', 'walk', 'bike', 'swim', 'row', 'elliptical', 'other'];

function Cardio() {
  const { t } = useTranslation();
  const repos = useRepos();
  const { units } = useSettings();
  const saving = useSaveAction();
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const sessions = useQuery((r) => r.cardio.all()) ?? [];
  const weight = useQuery((r) => r.body.latestWeight());
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CardioKind>('run');
  const [minutes, setMinutes] = useState<number | ''>(30);
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [hr, setHr] = useState<number | ''>('');

  const durationSec = (minutes === '' ? 0 : minutes) * 60;
  const distanceM = distanceKm === '' ? undefined : distanceKm * 1000;
  const valid =
    minutes !== '' &&
    minutes > 0 &&
    minutes <= 1440 &&
    (distanceKm === '' || (distanceKm > 0 && distanceKm <= 1000)) &&
    (hr === '' || (Number.isInteger(hr) && hr >= 20 && hr <= 250));
  const kcal = estimateKcal({
    kind,
    durationSec,
    weightKg: weight?.weightKg ?? 75,
    distanceM,
  });
  const close = () => {
    if (saving.busy) return;
    setOpen(false);
    setKind('run');
    setMinutes(30);
    setDistanceKm('');
    setHr('');
  };

  const save = async () => {
    if (!valid) return;
    await repos.cardio.create({
      date: todayFn(),
      time: toLocalTime(),
      kind,
      durationSec,
      distanceM,
      avgHr: hr === '' ? undefined : hr,
      kcal,
    });
    setOpen(false);
    setMinutes(30);
    setDistanceKm('');
    setHr('');
  };

  return (
    <div className="space-y-3">
      <Button full onClick={() => setOpen(true)}>
        {t('gym.cardioNew')}
      </Button>

      <ul className="divide-y divide-hairline">
        {sessions
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-body">{t(`gym.cardioKinds.${s.kind}`)}</span>
                <span className="tnum block text-caption text-muted">
                  {durationLong(s.durationSec / 60)}
                  {s.distanceM
                    ? ` · ${num(toDisplay(s.distanceM / 1000, 'distance', units), 2)} ${t(`units.${unitKey('distance', units)}`)}`
                    : ''}
                  {s.distanceM
                    ? ` · ${t(units === 'imperial' ? 'gym.paceImperial' : 'gym.pace', { value: num((s.durationSec / 60 / (s.distanceM / 1000)) * (units === 'imperial' ? 1.609344 : 1), 2) })}`
                    : ''}
                </span>
              </span>
              <span className="tnum text-num">{num(s.kcal ?? 0)}</span>
              <button
                type="button"
                aria-label={t('common.delete')}
                className="tappable justify-center px-1 text-muted"
                onClick={() =>
                  void saving.run(async () => {
                    await repos.cardio.remove(s.id);
                    setDeletedId(s.id);
                  })
                }
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
      </ul>

      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {deletedId ? (
        <UndoToast
          message={t('common.deleted')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.cardio.restore(deletedId);
              setDeletedId(null);
            })
          }
          onExpire={() => setDeletedId(null)}
        />
      ) : null}

      <Sheet
        open={open}
        onClose={close}
        dirty={kind !== 'run' || minutes !== 30 || distanceKm !== '' || hr !== ''}
        onSave={valid ? () => void saving.run(save) : undefined}
        title={t('gym.cardioNew')}
        footer={
          <Button
            variant="primary"
            full
            disabled={!valid || saving.busy}
            onClick={() => void saving.run(save)}
          >
            {t('common.save')}
          </Button>
        }
      >
        {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
        {!valid ? (
          <p role="alert" className="text-caption text-over">
            {t('gym.cardioBounds')}
          </p>
        ) : null}
        <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
          {CARDIO_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`min-h-[36px] shrink-0 rounded-lg px-3 text-caption font-semibold ${
                kind === k ? 'bg-ink text-paper' : 'text-muted'
              }`}
            >
              {t(`gym.cardioKinds.${k}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div>
            <SectionHeader title={t('gym.duration')} />
            <div className="mt-1">
              <NumberField
                value={minutes}
                onChange={setMinutes}
                suffix={t('units.min')}
                aria-label={t('gym.duration')}
              />
            </div>
          </div>
          <div>
            <SectionHeader title={t('gym.distance')} />
            <div className="mt-1">
              <MeasureField
                measure="distance"
                value={distanceKm}
                onChange={setDistanceKm}
                suffix={t('units.km')}
                aria-label={t('gym.distance')}
              />
            </div>
          </div>
          <div>
            <SectionHeader title={t('gym.avgHr')} />
            <div className="mt-1">
              <NumberField value={hr} onChange={setHr} aria-label={t('gym.avgHr')} />
            </div>
          </div>
          <div>
            <SectionHeader title={t('gym.kcalEstimate')} />
            <div className="tnum mt-1 text-num">
              {num(kcal)} {t('units.kcal')}
            </div>
          </div>
        </div>
        <p className="mt-2 text-caption text-muted">{t('common.estimate')}</p>
      </Sheet>
    </div>
  );
}

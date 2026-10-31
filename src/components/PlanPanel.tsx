import { MeasureField } from '@/components/MeasureField';
/**
 * Планирование тренировок — задача 2 доработки 0.7.
 *
 * Календарь на месяц, точка на дне с планом, цвет точки — по статусу.
 * План создаётся из программы (состав предзаполняется и дальше правится
 * свободно) или пустым. Просроченные планы не удаляются: их предлагают
 * перенести на сегодня или пропустить.
 */
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteState } from '@/app/navigation';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings, useToday } from '@/app/hooks';
import { useSaveAction } from '@/app/useSaveAction';
import type { PlannedItem, PlannedStatus, PlannedWorkout, Routine } from '@/domain/model';
import { groupByDate, itemsFromRoutineDay, nextPlannedDates } from '@/domain/training/planning';

import { addDays, isoWeekday, startOfMonth } from '@/lib/date';
import { dateShort, monthLong } from '@/lib/format';
import { uuid } from '@/lib/id';
import {
  Button,
  NumberField,
  Panel,
  SectionHeader,
  Sheet,
  TextField,
  UndoToast,
} from '@/design-system/primitives';
import { ExercisePickerSheet } from './ExercisePickerSheet';

const EMPTY: never[] = [];

/** Статус передаётся и цветом, и подписью — требование доступности (19.3). */
const STATUS_TONE: Record<PlannedStatus, string> = {
  planned: 'bg-accent',
  started: 'bg-ink',
  completed: 'bg-good',
  skipped: 'bg-muted',
};

export function PlanPanel() {
  const { t } = useTranslation();
  const repos = useRepos();
  const navigate = useNavigate();
  const settings = useSettings();
  const today = useToday();

  const [selected, setSelected] = useRouteState('date', today);
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const [editing, setEditing] = useState<PlannedWorkout | null | undefined>(undefined);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [undoId, setUndoId] = useState<string | null>(null);
  const saving = useSaveAction();

  const plans = useQueryWithDefault((r) => r.plannedWorkouts.all(), EMPTY);
  const overdue = useQueryWithDefault((r) => r.plannedWorkouts.overdue(today), EMPTY, [today]);
  const exercises = useQueryWithDefault((r) => r.exercises.all(), EMPTY);
  const routines = useQueryWithDefault((r) => r.routines.all(), EMPTY);

  const byDate = useMemo(() => groupByDate(plans), [plans]);
  const grid = useMemo(
    () => monthGrid(month, settings.firstDayOfWeek),
    [month, settings.firstDayOfWeek],
  );
  const dayPlans = byDate.get(selected) ?? [];
  const exerciseName = useMemo(() => {
    const map = new Map(exercises.map((e) => [e.id, e] as const));
    return (id: string) => {
      const e = map.get(id);
      if (!e) return id;
      return settings.locale === 'ru' && e.nameI18n?.ru ? e.nameI18n.ru : e.name;
    };
  }, [exercises, settings.locale]);

  /** План → факт: создаём тренировку и подходы по целям плана. */
  const starting = useRef(false);
  const [startError, setStartError] = useState(false);
  const startPlan = async (plan: PlannedWorkout) => {
    if (starting.current) return;
    starting.current = true;
    setStartError(false);
    try {
      const workout = await repos.workouts.startPlanned(plan.id);
      navigate(`/workout/${workout.id}`);
    } catch {
      setStartError(true);
    } finally {
      starting.current = false;
    }
  };
  return (
    <div className="space-y-4">
      {startError ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
      {overdue.length > 0 ? (
        <Panel title={t('gym.planOverdue')}>
          <ul className="divide-y divide-hairline">
            {overdue.map((plan) => (
              <li key={plan.id} className="py-2">
                <div className="flex items-baseline justify-between">
                  <span className="truncate text-body">{plan.name}</span>
                  <span className="tnum text-caption text-muted">
                    {dateShort(plan.plannedDate)}
                  </span>
                </div>
                <div className="mt-1 flex gap-2">
                  <Button
                    disabled={saving.busy}
                    onClick={() =>
                      void saving.run(async () => {
                        await repos.plannedWorkouts.update(plan.id, {
                          plannedDate: today,
                        });
                      })
                    }
                  >
                    {t('gym.planMoveToday')}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={saving.busy}
                    onClick={() =>
                      void saving.run(async () => {
                        await repos.plannedWorkouts.setStatus(plan.id, 'skipped');
                      })
                    }
                  >
                    {t('gym.planSkip')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={t('common.back')}
            className="tappable justify-center px-2 text-muted"
            onClick={() => setMonth(startOfMonth(addDays(month, -1)))}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span className="text-section">{monthLong(month)}</span>
          <button
            type="button"
            aria-label={t('common.next')}
            className="tappable justify-center px-2 text-muted"
            onClick={() => setMonth(startOfMonth(addDays(month, 32)))}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1">
          {grid.map((date) => {
            const dayItems = byDate.get(date) ?? [];
            const inMonth = date.slice(0, 7) === month.slice(0, 7);
            const isSelected = date === selected;
            return (
              <button
                key={date}
                type="button"
                aria-label={date}
                aria-pressed={isSelected}
                onClick={() => setSelected(date)}
                className={`flex min-h-touch flex-col items-center justify-center rounded-lg text-caption ${
                  isSelected ? 'bg-ink text-paper' : inMonth ? 'text-ink' : 'text-muted opacity-40'
                } ${date === today && !isSelected ? 'border border-accent' : ''}`}
              >
                <span className="tnum">{Number(date.slice(8))}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {dayItems.slice(0, 3).map((plan) => (
                    <span
                      key={plan.id}
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[plan.status]}`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel
        title={dateShort(selected)}
        action={
          <Button variant="ghost" className="px-0" onClick={() => setEditing(null)}>
            {t('gym.planNew')}
          </Button>
        }
      >
        {dayPlans.length === 0 ? (
          <p className="py-3 text-body text-muted">{t('gym.planEmpty')}</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {dayPlans.map((plan) => (
              <li key={plan.id} className="py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-body">{plan.name}</span>
                  <span className="text-caption text-muted">
                    {t(`gym.planStatus.${plan.status}`)}
                  </span>
                </div>
                <div className="text-caption text-muted">
                  {plan.items.map((i) => exerciseName(i.exerciseId)).join(' · ')}
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {plan.status === 'planned' ? (
                    <Button variant="primary" onClick={() => void startPlan(plan)}>
                      {t('gym.planStart')}
                    </Button>
                  ) : null}
                  <Button onClick={() => setEditing(plan)}>{t('common.edit')}</Button>
                  <Button
                    variant="danger"
                    disabled={saving.busy}
                    onClick={() =>
                      void saving.run(async () => {
                        await repos.plannedWorkouts.remove(plan.id);
                        setUndoId(plan.id);
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Button full disabled={routines.length === 0} onClick={() => setBulkOpen(true)}>
        {t('gym.planBulk')}
      </Button>

      {editing !== undefined ? (
        <PlanEditorSheet
          open={editing !== undefined}
          plan={editing ?? undefined}
          date={selected}
          routines={routines}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      <BulkPlanSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        routines={routines}
        from={selected}
        busyDates={[...byDate.keys()]}
      />

      {undoId ? (
        <UndoToast
          message={t('gym.planDeleted')}
          actionLabel={t('common.undo')}
          onAction={() =>
            void saving.run(async () => {
              await repos.plannedWorkouts.restore(undoId);
              setUndoId(null);
            })
          }
          onExpire={() => setUndoId(null)}
        />
      ) : null}
    </div>
  );
}

/* ─────────────────────── Создание и правка одного плана ────────────────────── */

function PlanEditorSheet({
  open,
  onClose,
  plan,
  date,
  routines,
}: {
  open: boolean;
  onClose: () => void;
  plan?: PlannedWorkout;
  date: string;
  routines: readonly Routine[];
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const exercises = useQueryWithDefault((r) => r.exercises.all(), EMPTY);

  const [name, setName] = useState(plan?.name ?? '');
  const [plannedDate, setPlannedDate] = useState(plan?.plannedDate ?? date);
  const [items, setItems] = useState<PlannedItem[]>(plan?.items ?? []);
  const [routineId, setRoutineId] = useState(plan?.routineId ?? '');
  const [dayId, setDayId] = useState(plan?.routineDayId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shiftFollowing, setShiftFollowing] = useState(false);
  const saving = useSaveAction();
  const [key, setKey] = useState<string | undefined>(plan?.id);

  // Сброс формы при смене редактируемого плана — без useEffect, по ключу.
  if (key !== plan?.id) {
    setKey(plan?.id);
    setName(plan?.name ?? '');
    setPlannedDate(plan?.plannedDate ?? date);
    setItems(plan?.items ?? []);
    setRoutineId(plan?.routineId ?? '');
    setDayId(plan?.routineDayId ?? '');
  }

  const routine = routines.find((r) => r.id === routineId);
  const exerciseName = (id: string) => {
    const e = exercises.find((x) => x.id === id);
    if (!e) return id;
    return settings.locale === 'ru' && e.nameI18n?.ru ? e.nameI18n.ru : e.name;
  };

  /** Выбор дня программы предзаполняет состав; дальше план правится свободно. */
  const applyRoutineDay = (nextRoutineId: string, nextDayId: string) => {
    setRoutineId(nextRoutineId);
    setDayId(nextDayId);
    const source = routines.find((r) => r.id === nextRoutineId);
    const day = source?.days.find((d) => d.id === nextDayId);
    if (!source || !day) return;
    setName(`${source.name} · ${day.name}`);
    setItems(itemsFromRoutineDay(day).map((item) => ({ ...item, id: uuid() })));
  };

  const dirty =
    plan == null
      ? name.trim().length > 0 || items.length > 0
      : name !== plan.name || plannedDate !== plan.plannedDate || items !== plan.items;
  const valid =
    Boolean(plannedDate) &&
    items.every(
      (item) =>
        Number.isInteger(item.targetSets) &&
        item.targetSets >= 1 &&
        item.targetSets <= 50 &&
        Number.isInteger(item.targetRepsMin) &&
        item.targetRepsMin >= 1 &&
        Number.isInteger(item.targetRepsMax) &&
        item.targetRepsMax >= item.targetRepsMin &&
        item.targetRepsMax <= 1000 &&
        (item.targetWeightKg == null || (item.targetWeightKg >= 0 && item.targetWeightKg <= 1500)),
    );

  const save = async () => {
    if (!valid) return;
    const payload = {
      plannedDate,
      name: name.trim() || t('gym.planFree'),
      items,
      status: plan?.status ?? ('planned' as const),
      routineId: routineId || undefined,
      routineDayId: dayId || undefined,
    };

    if (plan) {
      if (plannedDate !== plan.plannedDate && shiftFollowing) {
        await repos.plannedWorkouts.reschedule(plan.id, plannedDate, true);
      }
      await repos.plannedWorkouts.update(plan.id, payload);
    } else {
      await repos.plannedWorkouts.create(payload);
    }
    onClose();
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !saving.busy && onClose()}
        dirty={dirty}
        onSave={valid ? () => void saving.run(save) : undefined}
        title={plan ? t('common.edit') : t('gym.planNew')}
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
        <div className="space-y-3">
          {saving.state === 'error' ? <p role="alert">{t('errors.saveFailed')}</p> : null}
          {!valid ? (
            <p role="alert" className="text-caption text-over">
              {t('gym.planBounds')}
            </p>
          ) : null}
          <div>
            <SectionHeader title={t('gym.planDate')} />
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="tnum min-h-touch w-full rounded-xl border border-hairline bg-surface px-3"
              aria-label={t('gym.planDate')}
            />
            {plan && plannedDate !== plan.plannedDate ? (
              <label className="mt-1 flex min-h-touch items-center gap-2 text-caption text-muted">
                <input
                  type="checkbox"
                  checked={shiftFollowing}
                  onChange={(e) => setShiftFollowing(e.target.checked)}
                />
                {t('gym.planShiftFollowing')}
              </label>
            ) : null}
          </div>

          <TextField value={name} onChange={setName} aria-label={t('common.name')} />

          <div>
            <SectionHeader title={t('gym.planFromRoutine')} />
            <select
              className="min-h-touch w-full rounded-xl border border-hairline bg-surface px-3 text-body"
              value={routineId ? `${routineId}|${dayId}` : ''}
              aria-label={t('gym.planFromRoutine')}
              onChange={(e) => {
                const [nextRoutine, nextDay] = e.target.value.split('|');
                if (!nextRoutine) {
                  setRoutineId('');
                  setDayId('');
                  return;
                }
                applyRoutineDay(nextRoutine, nextDay ?? '');
              }}
            >
              <option value="">{t('gym.planFree')}</option>
              {routines.flatMap((r) =>
                r.days.map((d) => (
                  <option key={`${r.id}|${d.id}`} value={`${r.id}|${d.id}`}>
                    {r.name} · {d.name}
                  </option>
                )),
              )}
            </select>
            {routine ? <p className="mt-1 text-caption text-muted">{routine.name}</p> : null}
          </div>

          <div>
            <SectionHeader title={t('gym.exercises')} />
            <ul className="space-y-2">
              {[...items]
                .sort((a, b) => a.order - b.order)
                .map((item) => (
                  <li key={item.id} className="rounded-lg bg-surface-2 p-2">
                    <div className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-caption">
                        {exerciseName(item.exerciseId)}
                      </span>
                      <button
                        type="button"
                        aria-label={t('gym.moveUp')}
                        className="tappable justify-center px-2 text-muted"
                        onClick={() => setItems((cur) => move(cur, item.id, -1))}
                      >
                        <span aria-hidden="true">↑</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('gym.moveDown')}
                        className="tappable justify-center px-2 text-muted"
                        onClick={() => setItems((cur) => move(cur, item.id, 1))}
                      >
                        <span aria-hidden="true">↓</span>
                      </button>
                      <button
                        type="button"
                        aria-label={t('common.delete')}
                        className="tappable justify-center px-2 text-muted"
                        onClick={() => setItems((cur) => cur.filter((i) => i.id !== item.id))}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    <div className="mt-1 grid grid-cols-4 gap-1">
                      <NumberField
                        value={item.targetSets}
                        onChange={(v) =>
                          setItems((cur) =>
                            patch(cur, item.id, {
                              targetSets: v === '' ? 1 : v,
                            }),
                          )
                        }
                        aria-label={t('gym.targetSets')}
                      />
                      <NumberField
                        value={item.targetRepsMin}
                        onChange={(v) =>
                          setItems((cur) =>
                            patch(cur, item.id, {
                              targetRepsMin: v === '' ? 1 : v,
                            }),
                          )
                        }
                        aria-label={t('gym.targetReps')}
                      />
                      <NumberField
                        value={item.targetRepsMax}
                        onChange={(v) =>
                          setItems((cur) =>
                            patch(cur, item.id, {
                              targetRepsMax: v === '' ? 1 : v,
                            }),
                          )
                        }
                        aria-label={t('gym.targetReps')}
                      />
                      <MeasureField
                        value={item.targetWeightKg ?? ''}
                        onChange={(v) =>
                          setItems((cur) =>
                            patch(cur, item.id, {
                              targetWeightKg: v === '' ? undefined : v,
                            }),
                          )
                        }
                        aria-label={t('gym.targetWeight')}
                      />
                    </div>
                  </li>
                ))}
            </ul>
            <Button variant="ghost" className="mt-1 px-0" onClick={() => setPickerOpen(true)}>
              {t('gym.addExercise')}
            </Button>
          </div>
        </div>
      </Sheet>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exercise) => {
          setItems((cur) => [
            ...cur,
            {
              id: uuid(),
              exerciseId: exercise.id,
              order: cur.length,
              targetSets: 3,
              targetRepsMin: 6,
              targetRepsMax: 10,
              restSec: exercise.defaultRestSec ?? 120,
            },
          ]);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

/* ───────────────────── Массовое планирование программы ─────────────────────── */

function BulkPlanSheet({
  open,
  onClose,
  routines,
  from,
  busyDates,
}: {
  open: boolean;
  onClose: () => void;
  routines: readonly Routine[];
  from: string;
  busyDates: readonly string[];
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const [routineId, setRoutineId] = useState(routines[0]?.id ?? '');
  const [weeks, setWeeks] = useState<number | ''>(4);
  const [weekdays, setWeekdays] = useState<number[]>([1, 3, 5]);
  const [created, setCreated] = useState<number | null>(null);

  const routine = routines.find((r) => r.id === routineId) ?? routines[0];

  const generate = async () => {
    if (!routine) return;
    const count = (weeks === '' ? 1 : weeks) * Math.max(1, weekdays.length);
    const dates = nextPlannedDates(routine, from, count, {
      weekdays,
      busyDates,
    });
    for (const item of dates) {
      await repos.plannedWorkouts.create({
        plannedDate: item.date,
        routineId: routine.id,
        routineDayId: item.routineDayId,
        name: item.name,
        items: item.items.map((i) => ({ ...i, id: uuid() })),
        status: 'planned',
      });
    }
    setCreated(dates.length);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('gym.planBulk')}>
      <div className="space-y-3">
        <select
          className="min-h-touch w-full rounded-xl border border-hairline bg-surface px-3 text-body"
          value={routineId}
          aria-label={t('gym.routines')}
          onChange={(e) => setRoutineId(e.target.value)}
        >
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <div>
          <SectionHeader title={t('gym.planWeekdays')} />
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={weekdays.includes(d)}
                onClick={() =>
                  setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
                }
                className={`tappable flex-1 justify-center rounded-lg border text-caption ${
                  weekdays.includes(d) ? 'border-accent text-accent' : 'border-hairline text-muted'
                }`}
              >
                {t(`habits.weekdayShort.${d}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title={t('gym.planWeeks')} />
          <NumberField value={weeks} onChange={setWeeks} aria-label={t('gym.planWeeks')} />
        </div>

        <Button variant="primary" full disabled={!routine} onClick={() => void generate()}>
          {t('gym.planBulk')}
        </Button>

        {created != null ? (
          <p className="tnum text-caption text-muted">{t('gym.planCreated', { count: created })}</p>
        ) : null}
      </div>
    </Sheet>
  );
}

/* ────────────────────────────────── Утилиты ────────────────────────────────── */

function move(items: PlannedItem[], id: string, delta: number): PlannedItem[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((i) => i.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sorted.length) return items;
  const [moved] = sorted.splice(index, 1);
  sorted.splice(target, 0, moved as PlannedItem);
  return sorted.map((item, order) => ({ ...item, order }));
}

function patch(items: PlannedItem[], id: string, p: Partial<PlannedItem>): PlannedItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...p } : i));
}

/** Сетка месяца: полные недели, включая хвосты соседних месяцев. */
function monthGrid(monthStart: string, firstDayOfWeek: 1 | 7): string[] {
  const shift = firstDayOfWeek === 1 ? isoWeekday(monthStart) - 1 : isoWeekday(monthStart) % 7;
  const start = addDays(monthStart, -shift);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

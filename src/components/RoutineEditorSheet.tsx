/**
 * Редактор программы — задача 4 доработки 0.7.
 *
 * Программа, созданная из шаблона, редактируется полностью: дни, состав,
 * порядок, целевые подходы и повторы, отдых, суперсеты. Исходный шаблон при
 * этом не меняется никогда — он лежит константой в `data/seed/routines.ts`
 * и в базу не попадает.
 *
 * «Вернуть как в шаблоне» восстанавливает исходный состав; действие теряет
 * правки, поэтому вызывающий экран показывает плашку отмены.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRepos } from '@/data/repositories/context';
import { useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import { useSaveAction } from '@/app/useSaveAction';
import type { Exercise, Routine, RoutineDay, RoutineItem } from '@/domain/model';
import { uuid } from '@/lib/id';
import { Button, NumberField, SectionHeader, Sheet, TextField } from '@/design-system/primitives';
import { ExercisePickerSheet } from './ExercisePickerSheet';

const EMPTY: never[] = [];

export function RoutineEditorSheet({
  open,
  onClose,
  routine,
  onResetToTemplate,
}: {
  open: boolean;
  onClose: () => void;
  routine?: Routine;
  /** Доступен только для программ с `templateKey`. */
  onResetToTemplate?: (routine: Routine) => Promise<void>;
}) {
  const { t } = useTranslation();
  const repos = useRepos();
  const settings = useSettings();
  const saving = useSaveAction();
  const exercises = useQueryWithDefault((r) => r.exercises.all(), EMPTY);

  const [name, setName] = useState('');
  const [days, setDays] = useState<RoutineDay[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    setName(routine?.name ?? '');
    setDays(routine?.days ?? []);
  }, [routine, open]);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const label = (id: string) => {
    const exercise = byId.get(id);
    if (!exercise) return id;
    return settings.locale === 'ru' && exercise.nameI18n?.ru ? exercise.nameI18n.ru : exercise.name;
  };

  const dirty = routine != null && (name !== routine.name || days !== routine.days);
  const valid =
    days.length > 0 &&
    days.every((day) =>
      day.items.every(
        (item) =>
          Number.isInteger(item.targetSets) &&
          item.targetSets >= 1 &&
          item.targetSets <= 50 &&
          Number.isInteger(item.targetRepsMin) &&
          item.targetRepsMin >= 1 &&
          Number.isInteger(item.targetRepsMax) &&
          item.targetRepsMax >= item.targetRepsMin &&
          item.targetRepsMax <= 1000 &&
          Number.isInteger(item.restSec) &&
          item.restSec >= 0 &&
          item.restSec <= 3600,
      ),
    );

  const patchDay = (dayId: string, patch: Partial<RoutineDay>) =>
    setDays((cur) => cur.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));

  const patchItem = (dayId: string, itemId: string, patch: Partial<RoutineItem>) =>
    setDays((cur) =>
      cur.map((d) =>
        d.id !== dayId
          ? d
          : { ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) },
      ),
    );

  /** Перестановка упражнения. Кнопками, а не перетаскиванием: пальцем в зале надёжнее. */
  const moveItem = (dayId: string, itemId: string, delta: number) =>
    setDays((cur) =>
      cur.map((d) => {
        if (d.id !== dayId) return d;
        const items = [...d.items].sort((a, b) => a.order - b.order);
        const index = items.findIndex((i) => i.id === itemId);
        const target = index + delta;
        if (index < 0 || target < 0 || target >= items.length) return d;
        const [moved] = items.splice(index, 1);
        items.splice(target, 0, moved as RoutineItem);
        return { ...d, items: items.map((i, order) => ({ ...i, order })) };
      }),
    );

  const addExercise = (dayId: string, exercise: Exercise) => {
    setDays((cur) =>
      cur.map((d) =>
        d.id !== dayId
          ? d
          : {
              ...d,
              items: [
                ...d.items,
                {
                  id: uuid(),
                  exerciseId: exercise.id,
                  order: d.items.length,
                  targetSets: 3,
                  targetRepsMin: 6,
                  targetRepsMax: 10,
                  restSec: exercise.defaultRestSec ?? settings.restTimer.defaultSec,
                },
              ],
            },
      ),
    );
    setPickerFor(null);
  };

  const save = async () => {
    if (!routine || !valid) return;
    await repos.routines.update(routine.id, { name: name.trim() || routine.name, days });
    onClose();
  };

  if (!routine) return null;

  return (
    <>
      <Sheet
        open={open}
        onClose={() => !saving.busy && onClose()}
        dirty={dirty}
        onSave={valid ? () => void saving.run(save) : undefined}
        title={t('gym.routineEdit')}
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
            {t('gym.routineBounds')}
          </p>
        ) : null}
        <TextField value={name} onChange={setName} aria-label={t('common.name')} />

        <div className="mt-4 space-y-4">
          {[...days]
            .sort((a, b) => a.order - b.order)
            .map((day) => (
              <div key={day.id} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <TextField
                    value={day.name}
                    onChange={(v) => patchDay(day.id, { name: v })}
                    aria-label={t('gym.routineDay')}
                  />
                  <button
                    type="button"
                    aria-label={t('gym.routineRemoveDay')}
                    className="tappable justify-center px-2 text-muted"
                    onClick={() => setDays((cur) => cur.filter((d) => d.id !== day.id))}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                <ul className="mt-2 space-y-2">
                  {[...day.items]
                    .sort((a, b) => a.order - b.order)
                    .map((item) => (
                      <li key={item.id} className="rounded-lg bg-surface-1 p-2">
                        <div className="flex items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-caption">
                            {label(item.exerciseId)}
                          </span>
                          <button
                            type="button"
                            aria-label={t('gym.moveUp')}
                            className="tappable justify-center px-2 text-muted"
                            onClick={() => moveItem(day.id, item.id, -1)}
                          >
                            <span aria-hidden="true">↑</span>
                          </button>
                          <button
                            type="button"
                            aria-label={t('gym.moveDown')}
                            className="tappable justify-center px-2 text-muted"
                            onClick={() => moveItem(day.id, item.id, 1)}
                          >
                            <span aria-hidden="true">↓</span>
                          </button>
                          <button
                            type="button"
                            aria-label={t('common.delete')}
                            className="tappable justify-center px-2 text-muted"
                            onClick={() =>
                              patchDay(day.id, {
                                items: day.items.filter((i) => i.id !== item.id),
                              })
                            }
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        </div>

                        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <label className="space-y-1 text-caption text-muted">
                            <span className="block">{t('gym.targetSets')}</span>
                            <NumberField
                              value={item.targetSets}
                              onChange={(v) =>
                                patchItem(day.id, item.id, { targetSets: v === '' ? 1 : v })
                              }
                              aria-label={t('gym.targetSets')}
                            />
                          </label>
                          <label className="space-y-1 text-caption text-muted">
                            <span className="block">{t('gym.targetRepsMin')}</span>
                            <NumberField
                              value={item.targetRepsMin}
                              onChange={(v) =>
                                patchItem(day.id, item.id, { targetRepsMin: v === '' ? 1 : v })
                              }
                              aria-label={t('gym.targetRepsMin')}
                            />
                          </label>
                          <label className="space-y-1 text-caption text-muted">
                            <span className="block">{t('gym.targetRepsMax')}</span>
                            <NumberField
                              value={item.targetRepsMax}
                              onChange={(v) =>
                                patchItem(day.id, item.id, { targetRepsMax: v === '' ? 1 : v })
                              }
                              aria-label={t('gym.targetRepsMax')}
                            />
                          </label>
                          <label className="space-y-1 text-caption text-muted">
                            <span className="block">{t('gym.rest')}</span>
                            <NumberField
                              value={item.restSec}
                              suffix={t('units.sec')}
                              onChange={(v) =>
                                patchItem(day.id, item.id, { restSec: v === '' ? 60 : v })
                              }
                              aria-label={t('gym.rest')}
                            />
                          </label>
                        </div>

                        <label className="mt-1 flex min-h-touch items-center gap-2 text-caption text-muted">
                          <input
                            type="checkbox"
                            checked={Boolean(item.supersetGroup)}
                            onChange={(e) =>
                              patchItem(day.id, item.id, {
                                supersetGroup: e.target.checked ? `s-${day.id}` : undefined,
                              })
                            }
                          />
                          {t('gym.supersetToggle')}
                        </label>
                      </li>
                    ))}
                </ul>

                <Button variant="ghost" className="mt-1 px-0" onClick={() => setPickerFor(day.id)}>
                  {t('gym.addExercise')}
                </Button>
              </div>
            ))}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Button
            full
            onClick={() =>
              setDays((cur) => [
                ...cur,
                {
                  id: uuid(),
                  name: `${t('gym.routineDay')} ${cur.length + 1}`,
                  order: cur.length,
                  items: [],
                },
              ])
            }
          >
            {t('gym.routineAddDay')}
          </Button>

          {routine.templateKey && onResetToTemplate ? (
            <>
              <SectionHeader
                title={t('gym.routineResetTemplate')}
                hint={t('gym.routineResetHint')}
              />
              <Button
                variant="danger"
                full
                disabled={saving.busy}
                onClick={() => void saving.run(() => onResetToTemplate(routine))}
              >
                {t('gym.routineResetTemplate')}
              </Button>
            </>
          ) : null}
        </div>
      </Sheet>

      <ExercisePickerSheet
        open={pickerFor != null}
        onClose={() => setPickerFor(null)}
        onPick={(exercise) => pickerFor && addExercise(pickerFor, exercise)}
      />
    </>
  );
}

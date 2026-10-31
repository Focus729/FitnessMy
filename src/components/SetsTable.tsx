import { MeasureField } from '@/components/MeasureField';
/**
 * Таблица подходов упражнения — раздел 10.1 ТЗ.
 *
 * Один компонент на два экрана (задача 1 доработки 0.7):
 *   • `mode="active"` — в зале: колонка «прошлый раз», отметка подхода
 *     одним нажатием, вызов плиты-калькулятора;
 *   • `mode="edit"` — правка завершённой тренировки: без таймера и подсказок
 *     прогрессии, зато с удалением подхода и сменой его типа.
 *
 * Раньше таблица была свёрстана внутри ActiveWorkout и переиспользовать её
 * было нельзя — это и была причина, по которой завершённую тренировку не
 * получалось редактировать.
 */
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import type { SetType, WorkoutSet } from '@/domain/model';
import { num } from '@/lib/format';
import { useSettings } from '@/app/hooks';
import { toDisplay, unitKey } from '@/lib/units';
import { Button, NumberField } from '@/design-system/primitives';

const SET_TYPES: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

export function SetsTable({
  mode,
  sets,
  lastSets,
  onChangeSet,
  onToggleComplete,
  onRemoveSet,
  onAddSet,
  onPlates,
}: {
  mode: 'active' | 'edit';
  sets: WorkoutSet[];
  /** Подходы этого упражнения на прошлой тренировке. Только для режима «в зале». */
  lastSets?: readonly WorkoutSet[];
  onChangeSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  onToggleComplete: (set: WorkoutSet) => void;
  onRemoveSet?: (setId: string) => void;
  onAddSet: (type: SetType) => void;
  onPlates?: (weightKg: number) => void;
}) {
  const { t } = useTranslation();
  const { units } = useSettings();
  const previous = (lastSets ?? []).filter((s) => s.type !== 'warmup');
  const showPrevious = mode === 'active';
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const updateValue = (setId: string, field: 'weightKg' | 'reps' | 'rpe', value: number | '') => {
    const valid =
      field === 'rpe'
        ? value === '' || (value >= 1 && value <= 10)
        : value !== '' &&
          (field === 'reps'
            ? Number.isInteger(value) && value >= 0 && value <= 1000
            : value >= 0 && value <= 1500);
    setInvalid((current) => ({ ...current, [`${setId}.${field}`]: !valid }));
    if (valid) onChangeSet(setId, { [field]: value === '' ? undefined : value });
  };

  return (
    <div>
      {sets.some((set) =>
        ['weightKg', 'reps', 'rpe'].some((field) => invalid[`${set.id}.${field}`]),
      ) ? (
        <p role="alert" className="mb-2 text-caption text-over">
          {t('gym.setBounds')}
        </p>
      ) : null}
      <table className="sets-table w-full text-caption">
        <thead>
          <tr className="text-label uppercase text-muted">
            <th className="w-6 text-left">#</th>
            {showPrevious ? <th className="text-left">{t('gym.previous')}</th> : null}
            {!showPrevious ? <th className="w-24 text-left">{t('gym.setType')}</th> : null}
            <th className="w-36 text-left">{t('gym.weight')}</th>
            <th className="w-24 text-left">{t('gym.reps')}</th>
            <th className="w-20 text-left">{t('gym.rpe')}</th>
            <th className="w-10" />
            {onRemoveSet ? <th className="w-10" /> : null}
          </tr>
        </thead>
        <tbody>
          {sets.map((set, i) => (
            <tr key={set.id} className="align-middle">
              <td className="tnum text-muted" data-label="#">
                {i + 1}
              </td>

              {showPrevious ? (
                <td className="tnum text-muted" data-label={t('gym.previous')}>
                  {previous[i]
                    ? t('gym.prevFormat', {
                        weight: num(
                          toDisplay((previous[i] as WorkoutSet).weightKg, 'mass', units),
                          2,
                        ),
                        unit: t(`units.${unitKey('mass', units)}`),
                        reps: (previous[i] as WorkoutSet).reps,
                      })
                    : t('gym.noPrevious')}
                </td>
              ) : (
                <td className="py-1 pr-1" data-label={t('gym.setType')}>
                  <select
                    className="min-h-touch w-full rounded-lg border border-hairline bg-surface px-1 text-caption"
                    value={set.type}
                    aria-label={t('gym.setType')}
                    onChange={(e) => onChangeSet(set.id, { type: e.target.value as SetType })}
                  >
                    {SET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`gym.setTypes.${type}`)}
                      </option>
                    ))}
                  </select>
                </td>
              )}

              <td className="py-1 pr-1" data-label={t('gym.weight')}>
                <MeasureField
                  value={set.weightKg}
                  onChange={(v) => updateValue(set.id, 'weightKg', v)}
                  aria-invalid={Boolean(invalid[`${set.id}.weightKg`])}
                  aria-label={t('gym.weight')}
                />
                {onPlates ? (
                  <button
                    type="button"
                    className="min-h-touch text-caption text-accent"
                    onClick={() => onPlates(set.weightKg)}
                    aria-label={t('gym.plateTitle')}
                  >
                    ⊕
                  </button>
                ) : null}
              </td>

              <td className="py-1 pr-1" data-label={t('gym.reps')}>
                <NumberField
                  value={set.reps}
                  onChange={(v) => updateValue(set.id, 'reps', v)}
                  aria-invalid={Boolean(invalid[`${set.id}.reps`])}
                  aria-label={t('gym.reps')}
                />
              </td>

              <td className="py-1 pr-1" data-label={t('gym.rpe')}>
                <NumberField
                  value={set.rpe ?? ''}
                  onChange={(v) => updateValue(set.id, 'rpe', v)}
                  aria-invalid={Boolean(invalid[`${set.id}.rpe`])}
                  aria-label={t('gym.rpe')}
                />
              </td>

              <td data-label={t('common.done')}>
                <button
                  type="button"
                  aria-label={t('common.done')}
                  aria-pressed={set.isCompleted}
                  disabled={['weightKg', 'reps', 'rpe'].some(
                    (field) => invalid[`${set.id}.${field}`],
                  )}
                  onClick={() => onToggleComplete(set)}
                  className={`tappable w-full justify-center rounded-lg border ${
                    set.isCompleted ? 'border-accent text-accent' : 'border-hairline text-muted'
                  }`}
                >
                  <span aria-hidden="true">✓</span>
                </button>
              </td>

              {onRemoveSet ? (
                <td>
                  <button
                    type="button"
                    aria-label={t('gym.removeSet')}
                    onClick={() => onRemoveSet(set.id)}
                    className="tappable w-full justify-center text-muted"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => onAddSet('normal')}>{t('gym.addSet')}</Button>
        <Button onClick={() => onAddSet('drop')}>{t('gym.addDrop')}</Button>
        {mode === 'active' ? (
          <Button onClick={() => onAddSet('warmup')}>{t('gym.setTypes.warmup')}</Button>
        ) : null}
      </div>
    </div>
  );
}

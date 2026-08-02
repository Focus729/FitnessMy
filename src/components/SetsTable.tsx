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
import type { SetType, WorkoutSet } from '@/domain/model';
import { num } from '@/lib/format';
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
  const previous = (lastSets ?? []).filter((s) => s.type !== 'warmup');
  const showPrevious = mode === 'active';

  return (
    <div>
      <table className="w-full text-caption">
        <thead>
          <tr className="text-label uppercase text-muted">
            <th className="w-6 text-left">#</th>
            {showPrevious ? <th className="text-left">{t('gym.previous')}</th> : null}
            {!showPrevious ? <th className="w-24 text-left">{t('gym.setType')}</th> : null}
            <th className="w-20 text-left">{t('gym.weight')}</th>
            <th className="w-16 text-left">{t('gym.reps')}</th>
            <th className="w-14 text-left">{t('gym.rpe')}</th>
            <th className="w-10" />
            {onRemoveSet ? <th className="w-10" /> : null}
          </tr>
        </thead>
        <tbody>
          {sets.map((set, i) => (
            <tr key={set.id} className="align-middle">
              <td className="tnum text-muted">{i + 1}</td>

              {showPrevious ? (
                <td className="tnum text-muted">
                  {previous[i]
                    ? t('gym.prevFormat', {
                        weight: num((previous[i] as WorkoutSet).weightKg),
                        reps: (previous[i] as WorkoutSet).reps,
                      })
                    : t('gym.noPrevious')}
                </td>
              ) : (
                <td className="py-1 pr-1">
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

              <td className="py-1 pr-1">
                {onPlates ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onPlates(set.weightKg)}
                    aria-label={t('gym.plateTitle')}
                  >
                    <NumberField
                      value={set.weightKg}
                      onChange={(v) => onChangeSet(set.id, { weightKg: v === '' ? 0 : v })}
                      aria-label={t('gym.weight')}
                    />
                  </button>
                ) : (
                  <NumberField
                    value={set.weightKg}
                    onChange={(v) => onChangeSet(set.id, { weightKg: v === '' ? 0 : v })}
                    aria-label={t('gym.weight')}
                  />
                )}
              </td>

              <td className="py-1 pr-1">
                <NumberField
                  value={set.reps}
                  onChange={(v) => onChangeSet(set.id, { reps: v === '' ? 0 : v })}
                  aria-label={t('gym.reps')}
                />
              </td>

              <td className="py-1 pr-1">
                <NumberField
                  value={set.rpe ?? ''}
                  onChange={(v) => onChangeSet(set.id, { rpe: v === '' ? undefined : v })}
                  aria-label={t('gym.rpe')}
                />
              </td>

              <td>
                <button
                  type="button"
                  aria-label={t('common.done')}
                  aria-pressed={set.isCompleted}
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

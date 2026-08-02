/**
 * Выбор упражнения из встроенной базы и своих (7.2).
 *
 * Задача 5 доработки 0.7:
 *   • панель закрывается кнопкой, фоном, свайпом и Esc — это даёт `Sheet`;
 *   • ничего не введено → закрытие молчаливое, подтверждений нет;
 *   • в поле поиска есть крестик очистки;
 *   • пустой запрос показывает избранное и недавние, а не пустой список.
 *
 * Панель НЕ пишет в базу: выбор возвращается наверх колбэком, запись делает
 * вызывающий экран. Отмена не оставляет мусора.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryWithDefault } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import type { Exercise } from '@/domain/model';
import { Sheet } from '@/design-system/Sheet';
import { SearchField, SectionHeader } from '@/design-system/primitives';

const EMPTY: never[] = [];

export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
  /** Идентификаторы упражнений, недавно использованных в этой тренировке. */
  recentIds = EMPTY,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  recentIds?: readonly string[];
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [query, setQuery] = useState('');

  const results = useQueryWithDefault((r) => r.exercises.search(query, 60), EMPTY, [query]);
  const label = (e: Exercise) =>
    settings.locale === 'ru' && e.nameI18n?.ru ? e.nameI18n.ru : e.name;

  /** При пустом запросе — избранное и недавние вместо всего списка подряд. */
  const groups = useMemo(() => {
    if (query.trim()) return [{ key: 'results' as const, items: results }];
    const favorites = results.filter((e) => e.isFavorite);
    const recent = recentIds
      .map((id) => results.find((e) => e.id === id))
      .filter((e): e is Exercise => e != null);
    const rest = results.filter((e) => !e.isFavorite && !recentIds.includes(e.id));
    return [
      { key: 'favorites' as const, items: favorites },
      { key: 'recent' as const, items: recent },
      { key: 'all' as const, items: rest },
    ].filter((g) => g.items.length > 0);
  }, [query, results, recentIds]);

  return (
    <Sheet open={open} onClose={onClose} title={t('gym.exercises')}>
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t('gym.exerciseSearch')}
        ariaLabel={t('gym.exerciseSearch')}
        autoFocus
      />

      {groups.map((group) => (
        <div key={group.key} className="mt-3">
          {group.key !== 'results' ? (
            <SectionHeader title={t(`gym.pickerGroups.${group.key}`)} />
          ) : null}
          <ul className="divide-y divide-hairline">
            {group.items.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  className="flex min-h-touch w-full items-center gap-3 py-2 text-left"
                  onClick={() => onPick(exercise)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{label(exercise)}</span>
                    <span className="block text-caption text-muted">
                      {exercise.primaryMuscles.map((m) => t(`muscles.${m}`, m)).join(', ')} ·{' '}
                      {t(`equipment.${exercise.equipment}`, exercise.equipment)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {groups.length === 0 ? (
        <p className="py-6 text-body text-muted">{t('errors.notFound')}</p>
      ) : null}
    </Sheet>
  );
}

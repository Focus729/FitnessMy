/** Выбор упражнения из встроенной базы и своих (7.2). */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@/data/repositories/hooks';
import { useSettings } from '@/app/hooks';
import type { Exercise } from '@/domain/model';
import { Sheet, TextField } from '@/design-system/primitives';

export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const results = useQuery((r) => r.exercises.search(query, 60), [query]) ?? [];

  const label = (e: Exercise) =>
    settings.locale === 'ru' && e.nameI18n?.ru ? e.nameI18n.ru : e.name;

  return (
    <Sheet open={open} onClose={onClose} title={t('gym.exercises')}>
      <TextField
        value={query}
        onChange={setQuery}
        placeholder={t('gym.exerciseSearch')}
        aria-label={t('gym.exerciseSearch')}
        autoFocus
      />
      <ul className="mt-2 divide-y divide-hairline">
        {results.map((exercise) => (
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
    </Sheet>
  );
}

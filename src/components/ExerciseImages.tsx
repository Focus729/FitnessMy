/**
 * Иллюстрации упражнения — раздел 7.2 (C5-в).
 *
 * Сначала пробуем локальный файл из бандла (его кладёт `npm run seed:images`),
 * при его отсутствии — исходный репозиторий free-exercise-db. Оба варианта
 * кэшируются Service Worker'ом стратегией cache-first, поэтому уже
 * открытое упражнение работает офлайн.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const REMOTE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';

export function ExerciseImages({ imageIds }: { imageIds: string[] }) {
  const { t } = useTranslation();
  if (imageIds.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {imageIds.slice(0, 2).map((id) => (
        <ExerciseImage key={id} id={id} alt={t('gym.instructions')} />
      ))}
    </div>
  );
}

function ExerciseImage({ id, alt }: { id: string; alt: string }) {
  const local = `${import.meta.env.BASE_URL}exercise-images/${id.replace(/\.jpg$/i, '.webp')}`;
  const [src, setSrc] = useState(local);
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="w-full rounded-xl border border-hairline bg-surface object-cover"
      onError={() => {
        if (src === local) setSrc(`${REMOTE}/${id}`);
        else setHidden(true);
      }}
    />
  );
}

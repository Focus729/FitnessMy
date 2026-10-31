/**
 * Свайп влево для удаления — раздел 18.5 ТЗ.
 *
 * Разрушающие действия делаются свайпом или долгим нажатием, но никогда
 * одиночным касанием. Подтверждения нет: вместо него — плашка «Удалено.
 * Вернуть» на пять секунд, которую показывает вызывающий экран.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const THRESHOLD_PX = 96;

export function SwipeToDelete({
  onDelete,
  deleteLabel,
  children,
}: {
  onDelete: () => void;
  deleteLabel: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);

  const end = () => {
    if (startX.current == null) return;
    const shouldDelete = offset <= -THRESHOLD_PX;
    startX.current = null;
    setOffset(0);
    if (shouldDelete) onDelete();
  };

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-caption text-over">
        {offset < -16 ? deleteLabel : null}
      </div>

      <div
        className="relative bg-surface-1 transition-transform"
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
          startX.current = e.clientX;
        }}
        onPointerMove={(e) => {
          if (startX.current == null) return;
          setOffset(Math.min(0, e.clientX - startX.current));
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          startX.current = null;
          setOffset(0);
        }}
      >
        {children}
      </div>

      {/* Клавиатурный путь: свайп мышью и пальцем недоступен с клавиатуры (19.3). */}
      <button
        type="button"
        aria-label={deleteLabel}
        title={t('gym.swipeToDelete')}
        onClick={onDelete}
        className="tappable ml-auto justify-center px-2 text-caption text-over"
      >
        {deleteLabel}
      </button>
    </div>
  );
}

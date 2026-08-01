/**
 * Лента дня — раздел 18.4. Сигнатурный элемент интерфейса.
 *
 * Горизонтальная полоса 24 px, представляющая сутки от 00:00 до 24:00:
 *   • заливка — окно питания (первая → последняя запись дня);
 *   • круг — приём пищи, радиус пропорционален калорийности;
 *   • треугольник — тренировка;
 *   • тонкая риска — вода;
 *   • нажатие на отметку — переход к записи.
 *
 * «Лента накапливает смысл: через месяц пользователь видит собственный режим
 * питания как узор, без единой цифры.» Это единственное место, где допущена
 * выразительность; всё остальное намеренно тихое.
 *
 * Реализация — позиционированные элементы, а не растянутый SVG: так отметки
 * не искажаются по горизонтали при любой ширине экрана.
 */
import { markRadius, timeLabel, type RibbonMark, type RibbonModel } from '@/domain/nutrition/fasting';

const HOURS = [0, 6, 12, 18, 24];

export function Ribbon({
  model,
  onSelect,
  ariaLabel,
  showWindow = true,
}: {
  model: RibbonModel;
  onSelect?: (mark: RibbonMark) => void;
  ariaLabel?: string;
  /** Заливка окна питания появляется только при включённом голодании (18.4). */
  showWindow?: boolean;
}) {
  const pct = (minute: number) => `${(minute / 1440) * 100}%`;
  const { window: win } = model;
  const hasWindow = showWindow && win.startMin != null && win.endMin != null;

  return (
    <div className="relative h-6 w-full" role="img" aria-label={ariaLabel}>
      {/* Ось суток */}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline" />
      {HOURS.map((h) => (
        <div
          key={h}
          className="absolute top-1/2 h-2 w-px -translate-x-1/2 -translate-y-1/2 bg-hairline"
          style={{ left: pct(h * 60) }}
        />
      ))}

      {/* Окно питания */}
      {hasWindow ? (
        <div
          className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-sm bg-accent/15"
          style={{
            left: pct(win.startMin as number),
            width: pct(Math.max(6, (win.endMin as number) - (win.startMin as number))),
          }}
        />
      ) : null}

      {model.marks.map((mark) => {
        const left = pct(mark.minute);
        const interactive = Boolean(onSelect);
        const label = markAria(mark);

        if (mark.kind === 'water') {
          return (
            <Mark
              key={mark.id}
              left={left}
              interactive={interactive}
              label={label}
              onSelect={() => onSelect?.(mark)}
            >
              <span className="block h-[5px] w-px translate-y-[7px] bg-muted" />
            </Mark>
          );
        }

        if (mark.kind === 'workout') {
          return (
            <Mark
              key={mark.id}
              left={left}
              interactive={interactive}
              label={label}
              onSelect={() => onSelect?.(mark)}
            >
              <span
                className="block h-0 w-0 -translate-y-[7px] border-x-[4px] border-b-[7px] border-x-transparent"
                style={{ borderBottomColor: 'var(--ink)' }}
              />
            </Mark>
          );
        }

        const r = markRadius(mark.kcal, model.maxKcal);
        return (
          <Mark
            key={mark.id}
            left={left}
            interactive={interactive}
            label={label}
            onSelect={() => onSelect?.(mark)}
          >
            <span
              className="block rounded-full bg-ink"
              style={{ width: r * 2, height: r * 2 }}
            />
          </Mark>
        );
      })}
    </div>
  );
}

function Mark({
  left,
  children,
  interactive,
  label,
  onSelect,
}: {
  left: string;
  children: React.ReactNode;
  interactive: boolean;
  label: string;
  onSelect: () => void;
}) {
  const style = { left } as const;
  const className =
    'absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center';

  if (!interactive) {
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <button type="button" aria-label={label} className={className} style={style} onClick={onSelect}>
      {children}
    </button>
  );
}

function markAria(mark: RibbonMark): string {
  return `${timeLabel(mark.minute)} ${mark.label}`.trim();
}

/** Подписи часов под лентой. */
export function RibbonScale() {
  return (
    <div className="tnum flex justify-between text-[10px] leading-none text-muted">
      {HOURS.map((h) => (
        <span key={h}>{String(h).padStart(2, '0')}</span>
      ))}
    </div>
  );
}

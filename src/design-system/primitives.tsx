/**
 * Примитивы дизайн-системы — раздел 18.5.
 *
 * Обязательный набор: Button, NumberField, Sheet, Ring, Bar, Ribbon, Tile,
 * Row, Stepper, Segmented, Sparkline. Ribbon и Sparkline вынесены в отдельные
 * файлы — они сложнее остальных.
 *
 * Правила, зашитые здесь:
 *   • область нажатия не менее 44×44 (потные руки в зале);
 *   • диалоги ввода — выезжающие снизу панели, не модальные окна;
 *   • числовой ввод открывает числовую клавиатуру и выделяет значение;
 *   • состояние не передаётся одним лишь цветом (19.3).
 */
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation as useI18n } from 'react-i18next';

/* ──────────────────────────────────── Button ───────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  full,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  full?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-touch px-4 rounded-xl text-[15px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none';
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-paper',
    secondary: 'bg-surface text-ink border border-hairline',
    ghost: 'text-muted hover:text-ink',
    danger: 'bg-surface text-over border border-hairline',
  };
  return (
    <button
      type="button"
      data-variant={variant}
      className={`hud-button ${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...props}
    />
  );
}

/* ─────────────────────────────────── Row ───────────────────────────────────── */

export function Row({
  label,
  value,
  hint,
  right,
  onClick,
  className = '',
}: {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={`flex w-full items-center gap-3 py-3 text-left min-h-touch ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-body truncate">{label}</div>
        {hint ? <div className="text-caption text-muted">{hint}</div> : null}
      </div>
      {value != null ? <div className="tnum text-num shrink-0">{value}</div> : null}
      {right}
    </Tag>
  );
}

/* Sheet вынесен в отдельный файл — см. пояснение в design-system/Sheet.tsx. */
export { Sheet, type SheetProps } from './Sheet';

/* ───────────────────────────────── NumberField ─────────────────────────────── */

/**
 * Числовое поле. inputMode="decimal" открывает числовую клавиатуру,
 * autoFocus выделяет значение целиком — экран граммовки строится на этом (9.2).
 */
export function NumberField({
  value,
  onChange,
  suffix,
  big,
  selectOnFocus = true,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '';
  onChange: (value: number | '') => void;
  suffix?: ReactNode;
  big?: boolean;
  selectOnFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  const lastEmitted = useRef<number | ''>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) setDraft(String(value));
    lastEmitted.current = value;
  }, [value]);

  useEffect(() => {
    if (props.autoFocus && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [props.autoFocus]);

  return (
    <div
      className={`flex items-baseline gap-2 rounded-xl border border-hairline bg-surface px-3 ${big ? 'py-2' : 'py-1'} ${className}`}
    >
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        className={`tnum w-full bg-transparent outline-none ${big ? 'text-[32px] leading-[40px] font-medium' : 'text-num'} min-h-touch`}
        value={draft}
        onFocus={(e) => {
          if (selectOnFocus) e.currentTarget.select();
        }}
        onChange={(e) => {
          const input = e.target.value;
          if (!/^\d*([.,]\d*)?$/.test(input)) return;
          setDraft(input);
          const raw = input.replace(',', '.');
          const parsed = Number(raw);
          const next = raw === '' || !Number.isFinite(parsed) ? '' : parsed;
          lastEmitted.current = next;
          onChange(next);
        }}
        {...props}
      />
      {suffix ? <span className="shrink-0 text-caption text-muted">{suffix}</span> : null}
    </div>
  );
}

/* ─────────────────────────────────── Stepper ───────────────────────────────── */

export function Stepper({
  value,
  step = 1,
  min = 0,
  max = 9999,
  onChange,
  ariaLabel,
}: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  ariaLabel?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  return (
    <div className="flex items-center gap-1" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label={`−${step}`}
        className="tappable justify-center rounded-lg border border-hairline px-3"
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <span className="tnum min-w-[3.5rem] text-center text-num">{value}</span>
      <button
        type="button"
        aria-label={`+${step}`}
        className="tappable justify-center rounded-lg border border-hairline px-3"
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  );
}

/* ────────────────────────────────── Segmented ──────────────────────────────── */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  // При пяти и более вариантах ряд не помещается в ширину телефона,
  // поэтому он прокручивается, а кнопки перестают растягиваться.
  const scrollable = options.length > 4;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`hud-segments flex gap-1 rounded-xl border border-hairline p-1 ${
        scrollable ? 'flex-wrap' : 'flex-wrap sm:flex-nowrap'
      }`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`hud-button min-h-touch rounded-lg px-2 text-caption font-semibold transition-colors ${
              scrollable ? 'flex-1 px-3' : 'flex-1'
            } ${active ? 'bg-ink text-paper' : 'text-muted'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────── Bar ──────────────────────────────────── */

/**
 * Полоса выполнения. Превышение обозначается И цветом, И знаком «!» —
 * приложение не полагается только на цвет (19.3).
 */
export function Bar({
  value,
  target,
  label,
  detail,
  showOver = true,
}: {
  value: number;
  target: number;
  label: ReactNode;
  detail?: ReactNode;
  showOver?: boolean;
}) {
  const ratio = target > 0 ? value / target : 0;
  const over = showOver && ratio > 1.05;
  const width = Math.min(100, ratio * 100);

  return (
    <div className="flex items-center gap-3">
      <span className="w-4 shrink-0 text-caption text-muted">{label}</span>
      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-hairline">
        <div
          className={`h-full rounded-full ${over ? 'bg-over' : 'bg-ink'}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`tnum shrink-0 text-caption ${over ? 'text-over' : 'text-muted'}`}>
        {over ? '! ' : ''}
        {detail}
      </span>
    </div>
  );
}

/* ──────────────────────────────────── Ring ─────────────────────────────────── */

/** Кольцо прогресса — вода на дашборде (9.4). */
export function Ring({
  value,
  target,
  size = 44,
  children,
  ariaLabel,
}: {
  value: number;
  target: number;
  size?: number;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const ratio = target > 0 ? Math.min(1, value / target) : 0;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative inline-flex items-center justify-center" aria-label={ariaLabel}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
        />
      </svg>
      {children ? <span className="tnum absolute text-[11px] leading-none">{children}</span> : null}
    </div>
  );
}

/* ──────────────────────────────────── Tile ─────────────────────────────────── */

/** Плитка вкладки «Частое». Одно нажатие = запись (9.2, путь на 5 секунд). */
export function Tile({
  title,
  subtitle,
  onClick,
  onLongPress,
  accent,
}: {
  title: string;
  subtitle?: string;
  onClick: () => void;
  onLongPress?: () => void;
  accent?: boolean;
}) {
  const timer = useRef<number | undefined>(undefined);

  const start = () => {
    if (!onLongPress) return;
    timer.current = window.setTimeout(onLongPress, 500);
  };
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      className={`flex min-h-[76px] flex-col justify-between rounded-xl border p-3 text-left ${
        accent ? 'border-accent' : 'border-hairline'
      } bg-surface`}
    >
      <span className="line-clamp-2 text-caption font-semibold leading-tight">{title}</span>
      {subtitle ? <span className="tnum text-caption text-muted">{subtitle}</span> : null}
    </button>
  );
}

/* ─────────────────────────────── Прочие мелочи ─────────────────────────────── */

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-label uppercase text-muted">{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 ${className}`}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex min-h-touch cursor-pointer items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-body">{label}</span>
        {hint ? <span className="block text-caption text-muted">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-hairline'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </label>
  );
}

export function TextField({
  value,
  onChange,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      className={`min-h-touch w-full rounded-xl border border-hairline bg-surface px-3 text-body outline-none ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}

/**
 * Плашка отмены вместо диалогов подтверждения (18.5):
 * удалил запись — внизу появилась «Удалено. Вернуть» на 5 секунд.
 */
export function UndoToast({
  message,
  actionLabel,
  onAction,
  onExpire,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onExpire: () => void;
}) {
  const [left, setLeft] = useState(5);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((v) => v - 1), 1000);
    const timeout = window.setTimeout(onExpire, 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, [onExpire]);

  return createPortal(
    <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 shadow-sheet">
        <span className="flex-1 text-caption">{message}</span>
        <span className="tnum text-caption text-muted">{left}</span>
        <button type="button" className="text-caption font-semibold text-accent" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────── Разделение разделов и показателей (задача 6 v0.7) ───────── */

/**
 * Заголовок смысловой группы. Разделение делается иерархией, а не раскраской:
 * мелкая прописная метка плюс удвоенный отступ сверху — линия не нужна.
 * `action` — необязательное действие справа (например, «Добавить»).
 */
export function SectionHeader({
  title,
  hint,
  action,
  className = '',
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-3 pb-1 ${className}`}>
      <div className="min-w-0 flex-1">
        <h3 className="text-label uppercase text-muted">{title}</h3>
        {hint ? <p className="text-caption text-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Число с единицей и необязательной дельтой.
 *
 * Иерархия размеров по задаче 6: главная метрика экрана — `display`,
 * вспомогательные — мельче и цветом muted. Единица всегда мельче числа и
 * не жирная. Дельта передаётся И цветом, И стрелкой — состояние никогда
 * не передаётся одним лишь цветом (19.3).
 */
export function MetricValue({
  value,
  unit,
  size = 'md',
  delta,
  deltaGood,
  label,
  className = '',
}: {
  value: ReactNode;
  unit?: ReactNode;
  size?: 'display' | 'lg' | 'md' | 'sm';
  /** Изменение к прошлому периоду. Знак определяет стрелку. */
  delta?: number;
  /** Куда «хорошо»: рост или снижение. По умолчанию рост. */
  deltaGood?: 'up' | 'down' | 'neutral';
  label?: ReactNode;
  className?: string;
}) {
  const sizes: Record<string, string> = {
    display: 'text-[40px] leading-[44px] font-medium tracking-[-0.02em]',
    lg: 'text-[24px] leading-[30px] font-medium',
    md: 'text-num',
    sm: 'text-caption',
  };
  const arrow = delta == null || delta === 0 ? null : delta > 0 ? '↑' : '↓';
  const good = delta == null || delta === 0 ? null : delta > 0 === ((deltaGood ?? 'up') === 'up');

  return (
    <div className={className}>
      {label ? <div className="text-label uppercase text-muted">{label}</div> : null}
      <div className="flex items-baseline gap-1.5">
        <span className={`tnum ${sizes[size]}`}>{value}</span>
        {unit ? <span className="text-caption font-normal text-muted">{unit}</span> : null}
        {arrow ? (
          <span
            className={`tnum text-caption ${deltaGood === 'neutral' ? 'text-muted' : good ? 'text-good' : 'text-over'}`}
          >
            <span aria-hidden="true">{arrow}</span> {Math.abs(delta as number)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Разделитель. Использовать редко — только там, где отступа недостаточно. */
export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-hairline ${className}`} />;
}

/**
 * Карточка группы: поверхность уровня 1 на фоне экрана (уровень 0).
 * Разница — в оттенке фона, не в тенях и не в рамках.
 */
export function Panel({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`hud-block rounded-2xl bg-surface-1 p-4 ${className}`}>
      {title ? <SectionHeader title={title} hint={hint} action={action} /> : null}
      {children}
    </section>
  );
}

/** Поле поиска с крестиком очистки (задача 5, пункт 6). */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-hairline bg-surface pr-1">
      <input
        type="search"
        className="min-h-touch w-full bg-transparent px-3 text-body outline-none [&::-webkit-search-cancel-button]:appearance-none"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          aria-label={t('common.clear')}
          onClick={() => onChange('')}
          className="flex h-touch w-touch shrink-0 items-center justify-center text-muted"
        >
          <span aria-hidden="true">✕</span>
        </button>
      ) : null}
    </div>
  );
}

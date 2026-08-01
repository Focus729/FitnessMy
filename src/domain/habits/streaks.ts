/**
 * Серии и заморозки — раздел 12.2.
 *
 * Правила из ТЗ дословно:
 *   Серия увеличивается за каждый день, где выполнены все запланированные привычки.
 *   Пропущенный день покрывается заморозкой, если она есть в запасе.
 *   Заморозки: +1 за каждые 7 дней непрерывной серии, в запасе не более 3.
 *   Дни без запланированных привычек серию не разрывают и не увеличивают.
 */
import type { LocalDate } from '@/domain/model';

export const MAX_FREEZES = 3;
export const FREEZE_EVERY_DAYS = 7;

/** Состояние дня с точки зрения серии. */
export type DayStatus = 'done' | 'missed' | 'notScheduled';

export interface StreakResult {
  current: number;
  best: number;
  freezes: number;
  /** Дни, покрытые заморозкой — помечаются в истории. */
  frozenDays: LocalDate[];
  lastDate: LocalDate | null;
}

export interface StreakDay {
  date: LocalDate;
  status: DayStatus;
}

/**
 * Пересчёт серии по всей истории. Функция чистая и детерминированная:
 * одинаковая история всегда даёт одинаковый результат, поэтому её можно
 * безопасно вызывать повторно после ретроактивного заполнения.
 *
 * `startFreezes` — заморозки, накопленные до начала переданного отрезка.
 */
export function computeStreak(days: StreakDay[], startFreezes = 0): StreakResult {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  let current = 0;
  let best = 0;
  let freezes = clampFreezes(startFreezes);
  let sinceLastFreezeAward = 0;
  const frozenDays: LocalDate[] = [];
  let lastDate: LocalDate | null = null;

  for (const day of sorted) {
    if (day.status === 'notScheduled') continue;

    if (day.status === 'done') {
      current += 1;
      sinceLastFreezeAward += 1;
      lastDate = day.date;
      if (sinceLastFreezeAward >= FREEZE_EVERY_DAYS) {
        sinceLastFreezeAward = 0;
        freezes = clampFreezes(freezes + 1);
      }
    } else if (freezes > 0) {
      // Пропуск покрыт заморозкой: серия сохраняется, но не растёт.
      freezes -= 1;
      frozenDays.push(day.date);
      lastDate = day.date;
    } else {
      current = 0;
      sinceLastFreezeAward = 0;
    }

    if (current > best) best = current;
  }

  return { current, best, freezes, frozenDays, lastDate };
}

function clampFreezes(v: number): number {
  return Math.min(MAX_FREEZES, Math.max(0, v));
}

/**
 * Статус дня для «общей» серии: все запланированные на день привычки выполнены.
 */
export function dayStatusFromHabits(args: {
  scheduledCount: number;
  completedCount: number;
}): DayStatus {
  if (args.scheduledCount === 0) return 'notScheduled';
  return args.completedCount >= args.scheduledCount ? 'done' : 'missed';
}

/**
 * Статус дня для серии, построенной на факте («логировал питание»,
 * «тренировался»). Такие серии учитывают каждый день.
 */
export function dayStatusFromFlag(done: boolean): DayStatus {
  return done ? 'done' : 'missed';
}

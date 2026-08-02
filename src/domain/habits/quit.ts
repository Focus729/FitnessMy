/**
 * Привычки, от которых отказываются — задача 3 доработки 0.7.
 *
 * Ключевое правило, отличающее `quit` от `build`:
 * **пропущенный день не обнуляет серию.** Серия обнуляется только явной
 * отметкой срыва. Человек, который три дня не открывал приложение, всё это
 * время не курил — счётчик должен продолжать расти. Обнуление за неоткрытое
 * приложение демотивирует и делает функцию бесполезной.
 *
 * Поэтому заморозки (`GameState.freezes`) здесь не применяются: покрывать
 * нечего, пропусков не существует.
 */
import type { HabitLog, LocalDate } from '@/domain/model';
import { addDays, diffDays } from '@/lib/date';

/** Вехи, которые отмечаются в достижениях при включённой геймификации. */
export const QUIT_MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365] as const;

export interface QuitStats {
  /** Непрерывная серия воздержания в днях, включая сегодня. */
  currentStreak: number;
  /** Лучшая серия за всё время. */
  bestStreak: number;
  /** Всего дней без срывов с даты отказа. */
  totalCleanDays: number;
  relapseCount: number;
  lastRelapseDate: LocalDate | null;
  /** Ближайшая непройденная веха и сколько дней до неё. */
  nextMilestone: number | null;
  daysToNextMilestone: number | null;
  /** Пройденные вехи. */
  reachedMilestones: number[];
}

/** Даты срывов по логам, отсортированные по возрастанию. */
function relapseDates(logs: HabitLog[]): LocalDate[] {
  return logs
    .filter((l) => !l.deletedAt && l.outcome === 'relapse')
    .map((l) => l.date)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Непрерывная серия воздержания: дни от последнего срыва (или от даты отказа)
 * до сегодня включительно.
 */
export function currentAbstinenceStreak(
  logs: HabitLog[],
  quitStartDate: LocalDate,
  today: LocalDate,
): number {
  if (today < quitStartDate) return 0;

  const relapses = relapseDates(logs).filter((d) => d <= today);
  const last = relapses[relapses.length - 1];

  // День срыва серию не засчитывает — счёт идёт со следующего дня.
  const from = last ? addDays(last, 1) : quitStartDate;
  if (today < from) return 0;
  return diffDays(today, from) + 1;
}

/** Лучшая серия за всё время, включая текущую. */
export function bestAbstinenceStreak(
  logs: HabitLog[],
  quitStartDate: LocalDate,
  today?: LocalDate,
): number {
  const relapses = relapseDates(logs);
  let best = 0;
  let from = quitStartDate;

  for (const relapse of relapses) {
    if (relapse >= from) best = Math.max(best, diffDays(relapse, from));
    from = addDays(relapse, 1);
  }

  if (today && today >= from) best = Math.max(best, diffDays(today, from) + 1);
  return best;
}

export function quitStats(
  logs: HabitLog[],
  quitStartDate: LocalDate,
  today: LocalDate,
): QuitStats {
  const relapses = relapseDates(logs).filter((d) => d <= today);
  const currentStreak = currentAbstinenceStreak(logs, quitStartDate, today);
  const bestStreak = bestAbstinenceStreak(logs, quitStartDate, today);

  const totalDays = today >= quitStartDate ? diffDays(today, quitStartDate) + 1 : 0;
  const totalCleanDays = Math.max(0, totalDays - relapses.length);

  const reachedMilestones = QUIT_MILESTONES.filter((m) => bestStreak >= m);
  const nextMilestone = QUIT_MILESTONES.find((m) => m > currentStreak) ?? null;

  return {
    currentStreak,
    bestStreak,
    totalCleanDays,
    relapseCount: relapses.length,
    lastRelapseDate: relapses[relapses.length - 1] ?? null,
    nextMilestone,
    daysToNextMilestone: nextMilestone == null ? null : nextMilestone - currentStreak,
    reachedMilestones: [...reachedMilestones],
  };
}

/** Веха, взятая именно сегодня — чтобы отметить её один раз. */
export function milestoneReachedToday(streak: number): number | null {
  return QUIT_MILESTONES.find((m) => m === streak) ?? null;
}

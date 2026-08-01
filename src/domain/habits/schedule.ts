/** Расписания привычек — раздел 12.1 (четыре типа). */
import type { Habit, HabitLog, HabitSchedule, LocalDate } from '@/domain/model';
import { diffDays, isoWeekday, startOfWeek, toLocalDate, parseLocalDate } from '@/lib/date';

/**
 * Запланирована ли привычка на конкретный день.
 *
 * Для `timesPerWeek` привязки к дням нет: считается, что привычка «доступна»
 * каждый день недели, пока недельная квота не выбрана.
 */
export function isScheduledOn(
  habit: Pick<Habit, 'schedule' | 'createdAt'>,
  date: LocalDate,
  logsThisWeek: HabitLog[] = [],
  firstDayOfWeek: 1 | 7 = 1,
): boolean {
  const created = toLocalDate(new Date(habit.createdAt));
  if (date < created) return false;
  return matchesSchedule(habit.schedule, date, created, logsThisWeek, firstDayOfWeek);
}

function matchesSchedule(
  schedule: HabitSchedule,
  date: LocalDate,
  createdDate: LocalDate,
  logsThisWeek: HabitLog[],
  firstDayOfWeek: 1 | 7,
): boolean {
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return schedule.days.includes(isoWeekday(date));
    case 'everyNDays': {
      const n = Math.max(1, schedule.n);
      return diffDays(date, createdDate) % n === 0;
    }
    case 'timesPerWeek': {
      const weekStart = startOfWeek(date, firstDayOfWeek);
      const done = logsThisWeek.filter(
        (l) => l.completed && l.date >= weekStart && l.date <= date,
      ).length;
      return done < schedule.times;
    }
  }
}

/**
 * Считается ли день «выполненным» для привычки.
 * Привычка с целевым значением требует достижения значения.
 */
export function isHabitDone(habit: Pick<Habit, 'targetValue'>, log?: HabitLog): boolean {
  if (!log) return false;
  if (habit.targetValue != null && log.value != null) return log.value >= habit.targetValue;
  return log.completed;
}

/** Ретроактивное заполнение: вчерашний день можно отметить в течение 48 часов (2.6). */
export function canEditRetroactively(date: LocalDate, now: Date = new Date()): boolean {
  const target = parseLocalDate(date);
  // Дедлайн — конец дня + 48 часов.
  const deadline = new Date(target);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(0, 0, 0, 0);
  return now.getTime() <= deadline.getTime() + 48 * 3_600_000 && target.getTime() <= now.getTime();
}

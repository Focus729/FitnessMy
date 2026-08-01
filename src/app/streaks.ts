/**
 * Пересчёт серий — раздел 12.2.
 *
 * Серии считаются отдельно: общая по привычкам, по логированию питания,
 * по тренировкам. Пересчёт полный и детерминированный, поэтому безопасен
 * после ретроактивного заполнения.
 */
import type { Repositories } from '@/data/repositories/types';
import { computeStreak, dayStatusFromFlag, dayStatusFromHabits, type StreakDay } from '@/domain/habits/streaks';
import { isHabitDone, isScheduledOn } from '@/domain/habits/schedule';
import { lastNDays, today } from '@/lib/date';

const WINDOW_DAYS = 400;

export async function recomputeStreaks(repos: Repositories): Promise<void> {
  const settings = await repos.settings.get();
  const dates = lastNDays(WINDOW_DAYS, today());
  const from = dates[0] as string;
  const to = dates[dates.length - 1] as string;

  const [habits, habitLogs, diaryDates, workouts, state] = await Promise.all([
    repos.habits.all(),
    repos.habitLogs.byDateRange(from, to),
    repos.diary.loggedDates(from, to),
    repos.workouts.byDateRange(from, to),
    repos.game.get(),
  ]);

  const activeHabits = habits.filter((h) => !h.archived);
  const logsByHabit = new Map<string, typeof habitLogs>();
  for (const log of habitLogs) {
    const list = logsByHabit.get(log.habitId) ?? [];
    list.push(log);
    logsByHabit.set(log.habitId, list);
  }

  const habitDays: StreakDay[] = dates.map((date) => {
    let scheduled = 0;
    let completed = 0;
    for (const habit of activeHabits) {
      const logs = logsByHabit.get(habit.id) ?? [];
      if (!isScheduledOn(habit, date, logs, settings.firstDayOfWeek)) continue;
      scheduled += 1;
      const log = logs.find((l) => l.date === date);
      if (isHabitDone(habit, log)) completed += 1;
    }
    return { date, status: dayStatusFromHabits({ scheduledCount: scheduled, completedCount: completed }) };
  });

  const loggedSet = new Set(diaryDates);
  const foodDays: StreakDay[] = dates.map((date) => ({
    date,
    status: dayStatusFromFlag(loggedSet.has(date)),
  }));

  // Серия тренировок считается по неделям: тренировался ли хотя бы раз за неделю.
  const workoutWeeks = new Map<string, boolean>();
  for (const date of dates) {
    const week = date.slice(0, 4) + '-W' + isoWeek(date);
    workoutWeeks.set(week, workoutWeeks.get(week) ?? false);
  }
  for (const w of workouts.filter((x) => x.finishedAt)) {
    workoutWeeks.set(w.date.slice(0, 4) + '-W' + isoWeek(w.date), true);
  }
  const workoutDays: StreakDay[] = [...workoutWeeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, done], i) => ({ date: `${week}-${i}`, status: dayStatusFromFlag(done) }));

  const habitsStreak = computeStreak(habitDays);
  const foodStreak = computeStreak(foodDays);
  const workoutStreak = computeStreak(workoutDays);

  await repos.game.update({
    freezes: habitsStreak.freezes,
    streaks: {
      ...state.streaks,
      habits: {
        current: habitsStreak.current,
        best: habitsStreak.best,
        lastDate: habitsStreak.lastDate ?? '',
      },
      food: {
        current: foodStreak.current,
        best: foodStreak.best,
        lastDate: foodStreak.lastDate ?? '',
      },
      workoutWeeks: {
        current: workoutStreak.current,
        best: workoutStreak.best,
        lastDate: workoutStreak.lastDate ?? '',
      },
    },
  });
}

function isoWeek(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const target = new Date(dt.valueOf());
  const dayNr = (dt.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  return String(1 + Math.round(diff / (7 * 86_400_000))).padStart(2, '0');
}

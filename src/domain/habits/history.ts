import type {
  Habit,
  HabitLog,
  DiaryEntry,
  Workout,
  GameState,
  Settings,
} from '../model';
import {
  computeStreak,
  dayStatusFromFlag,
  dayStatusFromHabits,
  type StreakDay,
} from './streaks';
import { isHabitDone, isScheduledOn } from './schedule';
import { addDays, startOfWeek } from '../../lib/date';

/** Pure calculation shared by local refresh and atomic cloud hydration. */
export function deriveStreakProgress(input: {
  habits: Habit[];
  habitLogs: HabitLog[];
  diary: DiaryEntry[];
  workouts: Workout[];
  state: GameState;
  settings: Pick<Settings, 'firstDayOfWeek'>;
  asOf: string;
}): Pick<GameState, 'freezes' | 'streaks'> {
  const { habits, habitLogs, diary, workouts, state, settings, asOf } = input;
  const candidates = [
    asOf,
    ...habits.map((h) => h.createdAt.slice(0, 10)),
    ...habitLogs.map((log) => log.date),
    ...diary.map((entry) => entry.date),
    ...workouts.map((w) => w.date),
  ];
  const from = candidates.reduce(
    (earliest, date) => (date < earliest ? date : earliest),
    asOf,
  );
  const dates: string[] = [];
  for (let date = from; date <= asOf; date = addDays(date, 1)) dates.push(date);
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
      if (date < habit.createdAt.slice(0, 10)) continue;
      const logs = logsByHabit.get(habit.id) ?? [];
      if (!isScheduledOn(habit, date, logs, settings.firstDayOfWeek)) continue;
      scheduled += 1;
      const log = logs.find((l) => l.date === date);
      if (isHabitDone(habit, log)) completed += 1;
    }
    return {
      date,
      status: dayStatusFromHabits({
        scheduledCount: scheduled,
        completedCount: completed,
      }),
    };
  });

  const loggedSet = new Set(
    diary.filter((entry) => entry.date <= asOf).map((entry) => entry.date),
  );
  const foodDays: StreakDay[] = dates.map((date) => ({
    date,
    status: dayStatusFromFlag(loggedSet.has(date)),
  }));

  // Серия тренировок считается по неделям: тренировался ли хотя бы раз за неделю.
  const workoutWeeks = new Map<string, boolean>();
  for (const date of dates) {
    const week = startOfWeek(date);
    workoutWeeks.set(week, workoutWeeks.get(week) ?? false);
  }
  for (const w of workouts.filter((x) => x.finishedAt && x.date <= asOf)) {
    workoutWeeks.set(startOfWeek(w.date), true);
  }
  const workoutDays: StreakDay[] = [...workoutWeeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, done]) => ({ date: week, status: dayStatusFromFlag(done) }));

  const habitsStreak = computeStreak(habitDays);
  const foodStreak = computeStreak(foodDays);
  const workoutStreak = computeStreak(workoutDays);

  return {
    freezes: habitsStreak.freezes,
    streaks: {
      ...state.streaks,
      habits: {
        current: habitsStreak.current,
        best: Math.max(state.streaks.habits?.best ?? 0, habitsStreak.best),
        lastDate: habitsStreak.lastDate ?? '',
      },
      food: {
        current: foodStreak.current,
        best: Math.max(state.streaks.food?.best ?? 0, foodStreak.best),
        lastDate: foodStreak.lastDate ?? '',
      },
      workoutWeeks: {
        current: workoutStreak.current,
        best: Math.max(
          state.streaks.workoutWeeks?.best ?? 0,
          workoutStreak.best,
        ),
        lastDate: workoutStreak.lastDate ?? '',
      },
    },
  };
}

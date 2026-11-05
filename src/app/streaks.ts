import type { Repositories } from '@/data/repositories/types';
import { today } from '@/lib/date';
import { deriveStreakProgress } from '@/domain/habits/history';

export async function recomputeStreaks(
  repos: Repositories,
  asOf = today(),
): Promise<void> {
  const [settings, habits, habitLogs, diary, workouts, state] =
    await Promise.all([
      repos.settings.get(),
      repos.habits.all(),
      repos.habitLogs.all(),
      repos.diary.all(),
      repos.workouts.all(),
      repos.game.get(),
    ]);
  await repos.game.update(
    deriveStreakProgress({
      settings,
      habits,
      habitLogs,
      diary,
      workouts,
      state,
      asOf,
    }),
  );
}

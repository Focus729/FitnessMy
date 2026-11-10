import Dexie from 'dexie';
import type { LentaDB } from '../db/schema';
import { defaultSettings } from '../defaults';
import { deriveStreakProgress } from '../../domain/habits/history';
import { reconcileCloudProgress } from '../../domain/gamification/cloud-progress';
import type { ProgressMetadata } from './progress-wire';
import type { GameState } from '../../domain/model';

/** Runs inside the caller's suppressed hydration transaction; never invents a migration baseline. */
export async function deriveHydratedProgress(
  db: LentaDB,
  asOf: string,
): Promise<void> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(Date.parse(asOf)) ||
    new Date(asOf).toISOString().slice(0, 10) !== asOf
  )
    throw new Error('invalid_progress_date');
  if (Dexie.currentTransaction?.db !== db)
    throw new Error('progress_requires_transaction');
  const migration = await db
    .table<ProgressMetadata, string>('cloudState')
    .get('progress');
  if (!migration) return;
  const [existing, settings, habits, habitLogs, diary, workouts, events] =
    await Promise.all([
      db.gameState.get('singleton'),
      db.settings.get('singleton'),
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.diary.toArray(),
      db.workouts.toArray(),
      db.xpEvents.toArray(),
    ]);
  const state: GameState = existing ?? {
    id: 'singleton',
    xp: 0,
    level: 1,
    freezes: 0,
    streaks: {},
    unlockedAchievements: [],
    updatedAt: `${asOf}T00:00:00.000Z`,
  };
  const derived = deriveStreakProgress({
    state,
    settings: settings ?? defaultSettings(),
    asOf,
    habits: habits.filter((row) => !row.deletedAt),
    habitLogs: habitLogs.filter((row) => !row.deletedAt),
    diary: diary.filter((row) => !row.deletedAt),
    workouts: workouts.filter((row) => !row.deletedAt),
  });
  await db.gameState.put(
    reconcileCloudProgress({
      baselines: migration.baselines,
      events,
      snapshots: [
        state,
        {
          ...state,
          streaks: migration.streaks ?? {},
          unlockedAchievements: migration.unlockedAchievements ?? [],
        },
      ],
      derived,
      updatedAt: state.updatedAt,
    }),
  );
}

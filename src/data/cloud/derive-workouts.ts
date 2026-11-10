import type { LentaDB } from '../db/schema';
import { recalcWorkoutTotals } from '../../domain/training/aggregates';

/** Rebuild cached totals from the set rows visible in the caller's hydration transaction. */
export async function deriveWorkoutTotals(
  db: LentaDB,
  ids: Iterable<string>,
): Promise<void> {
  for (const workoutId of new Set(ids)) {
    const workout = await db.workouts.get(workoutId);
    if (!workout || workout.deletedAt) continue;
    const sets = await db.workoutSets
      .where('workoutId')
      .equals(workoutId)
      .toArray();
    await db.workouts.update(workoutId, {
      ...recalcWorkoutTotals(sets.filter((set) => !set.deletedAt)),
    });
  }
}

/**
 * Агрегаты тренировки — задача 1 доработки 0.7.
 *
 * Раньше тоннаж и число подходов считались в компоненте при завершении
 * тренировки. После появления правки завершённых тренировок это стало
 * источником рассинхронизации: подход правят, а агрегат в карточке остаётся
 * старым. Пересчёт вынесен сюда и вызывается репозиторием после КАЖДОЙ
 * операции над подходами.
 *
 * Правило раздела 10.5 ТЗ сохраняется: разминочные подходы (`type: 'warmup'`)
 * не входят ни в тоннаж, ни в число подходов.
 */
import type { WorkoutSet } from '@/domain/model';
import { countWorkingSets, totalVolume } from './oneRm';

export interface WorkoutTotals {
  totalVolumeKg: number;
  totalSets: number;
}

export function recalcWorkoutTotals(sets: WorkoutSet[]): WorkoutTotals {
  return {
    totalVolumeKg: totalVolume(sets),
    totalSets: countWorkingSets(sets),
  };
}

/**
 * Тоннаж по упражнениям внутри тренировки — для карточки просмотра.
 * Порядок сохраняется по первому появлению упражнения.
 */
export function volumeByExercise(sets: WorkoutSet[]): { exerciseId: string; volumeKg: number; sets: number }[] {
  const out = new Map<string, { exerciseId: string; volumeKg: number; sets: number }>();
  for (const set of sets) {
    if (!set.isCompleted || set.type === 'warmup') continue;
    const row = out.get(set.exerciseId) ?? { exerciseId: set.exerciseId, volumeKg: 0, sets: 0 };
    row.volumeKg += set.weightKg * set.reps;
    row.sets += 1;
    out.set(set.exerciseId, row);
  }
  return [...out.values()].map((r) => ({ ...r, volumeKg: Math.round(r.volumeKg * 10) / 10 }));
}

/** Длительность тренировки в секундах. Незавершённая считается до `now`. */
export function workoutDurationSec(
  workout: { startedAt: string; finishedAt?: string },
  now: Date = new Date(),
): number {
  const end = workout.finishedAt ? new Date(workout.finishedAt) : now;
  return Math.max(0, Math.floor((end.getTime() - new Date(workout.startedAt).getTime()) / 1000));
}

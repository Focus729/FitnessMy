/** Оценка одноповторного максимума и тоннаж — раздел 10.3 и 10.5. */
import type { WorkoutSet } from '@/domain/model';

/** Формула Эпли (10.3). Всегда показывается с пометкой «оценка». */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return round1(weightKg);
  return round1(weightKg * (1 + reps / 30));
}

/** Обратный ход: какой вес соответствует заданному числу повторов при известном 1ПМ. */
export function weightForReps(oneRm: number, reps: number): number {
  if (oneRm <= 0 || reps <= 0) return 0;
  return round1(oneRm / (1 + reps / 30));
}

/** Рабочие подходы: разминочные в тоннаж не входят (10.5). */
export function isWorkingSet(set: Pick<WorkoutSet, 'type' | 'isCompleted'>): boolean {
  return set.isCompleted && set.type !== 'warmup';
}

/** Тоннаж = Σ (вес × повторы) по рабочим подходам. */
export function totalVolume(sets: Pick<WorkoutSet, 'type' | 'isCompleted' | 'weightKg' | 'reps'>[]): number {
  return round1(
    sets.filter(isWorkingSet).reduce((sum, s) => sum + s.weightKg * s.reps, 0),
  );
}

export function countWorkingSets(sets: Pick<WorkoutSet, 'type' | 'isCompleted'>[]): number {
  return sets.filter(isWorkingSet).length;
}

export interface PersonalRecords {
  maxWeightKg: number;
  maxReps: number;
  max1RM: number;
  maxVolumeKg: number;
}

/** Личные рекорды по упражнению (10.5). */
export function personalRecords(
  sets: Pick<WorkoutSet, 'type' | 'isCompleted' | 'weightKg' | 'reps' | 'estimated1RM'>[],
): PersonalRecords {
  const working = sets.filter(isWorkingSet);
  return {
    maxWeightKg: max(working.map((s) => s.weightKg)),
    maxReps: max(working.map((s) => s.reps)),
    max1RM: round1(max(working.map((s) => s.estimated1RM || epley1RM(s.weightKg, s.reps)))),
    maxVolumeKg: round1(max(working.map((s) => s.weightKg * s.reps))),
  };
}

/** RIR = 10 − RPE (6.3). */
export function rirFromRpe(rpe: number): number {
  return Math.max(0, 10 - rpe);
}

function max(list: number[]): number {
  return list.length ? Math.max(...list) : 0;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * Двойная прогрессия — раздел 10.3.
 *
 * Приложение ПРЕДЛАГАЕТ, решает пользователь. Подсказка выводится строкой
 * над таблицей подходов, игнорируется без последствий.
 */
import type { WorkoutSet } from '@/domain/model';
import { isWorkingSet } from './oneRm';

export type ProgressionAdvice =
  | { kind: 'increaseWeight'; fromKg: number; toKg: number; reps: number }
  | { kind: 'increaseReps'; weightKg: number; reps: number }
  | { kind: 'repeat'; weightKg: number; reps: number }
  | { kind: 'deload'; fromKg: number; toKg: number }
  | { kind: 'noData' };

export interface ProgressionInput {
  /** Подходы упражнения на ПОСЛЕДНЕЙ тренировке, в порядке выполнения. */
  lastSets: Pick<WorkoutSet, 'type' | 'isCompleted' | 'weightKg' | 'reps'>[];
  targetRepsMin: number;
  targetRepsMax: number;
  /** Верх тела: +2.5 кг, низ: +5 кг (10.3). */
  bodyPart: 'upper' | 'lower';
  /** Рабочие веса последних тренировок этого упражнения, свежие первыми. */
  recentTopWeights?: number[];
}

export function suggestProgression(input: ProgressionInput): ProgressionAdvice {
  const working = input.lastSets.filter(isWorkingSet);
  if (working.length === 0) return { kind: 'noData' };

  const weight = mode(working.map((s) => s.weightKg));
  const allAtTop = working.every((s) => s.reps >= input.targetRepsMax);
  const step = input.bodyPart === 'lower' ? 5 : 2.5;

  // Вес стоит три тренировки подряд → предложить разгрузку.
  const recent = input.recentTopWeights ?? [];
  if (recent.length >= 3 && recent.slice(0, 3).every((w) => w === recent[0])) {
    return { kind: 'deload', fromKg: weight, toKg: round1(weight * 0.9) };
  }

  if (allAtTop) {
    return {
      kind: 'increaseWeight',
      fromKg: weight,
      toKg: round1(weight + step),
      reps: input.targetRepsMin,
    };
  }

  const first = working[0];
  if (first) {
    return { kind: 'increaseReps', weightKg: weight, reps: first.reps + 1 };
  }
  return { kind: 'repeat', weightKg: weight, reps: input.targetRepsMin };
}

/**
 * Предзаполнение полей веса и повторов прошлыми значениями (10.1, C2-в):
 * «в большинстве случаев пользователю остаётся нажать галочку».
 */
export function prefillFromLast(
  lastSets: Pick<WorkoutSet, 'type' | 'isCompleted' | 'weightKg' | 'reps' | 'order'>[],
  setIndex: number,
): { weightKg: number; reps: number } | undefined {
  const working = lastSets.filter(isWorkingSet).sort((a, b) => a.order - b.order);
  if (working.length === 0) return undefined;
  const match = working[Math.min(setIndex, working.length - 1)];
  return match ? { weightKg: match.weightKg, reps: match.reps } : undefined;
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount || (c === bestCount && v > best)) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

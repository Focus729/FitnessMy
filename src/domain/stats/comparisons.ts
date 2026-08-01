/**
 * Сопоставления — раздел 14.3.
 *
 * Строго описательная статистика, БЕЗ выводов о причинах.
 * Ограничения ТЗ, зашитые в код:
 *   • сопоставление не показывается, если наблюдений в любой группе меньше 10;
 *   • никаких коэффициентов корреляции и p-значений;
 *   • набор сопоставлений фиксированный, не генерируемый.
 *
 * Формулировки в i18n нейтральны: «в дни с X среднее Y было выше на Z».
 * Слов «влияет», «приводит к», «из-за» в словарях нет — это проверяется тестом.
 */
import type { DayFacts } from './summary';
import { isoWeekday } from '@/lib/date';

export const MIN_OBSERVATIONS = 10;

export type ComparisonKey =
  | 'sleepVsKcal'
  | 'workoutVsKcal'
  | 'stressVsIndex'
  | 'weekdayVsKcal'
  | 'sleepVsHabits';

export interface ComparisonResult {
  key: ComparisonKey;
  /** Хватило ли наблюдений в обеих группах. */
  available: boolean;
  groupA: { n: number; mean: number | null };
  groupB: { n: number; mean: number | null };
  /** mean(A) − mean(B). */
  difference: number | null;
}

interface ComparisonSpec {
  key: ComparisonKey;
  /** Признак группы A. null — день из выборки исключается. */
  inGroupA: (d: DayFactsExt) => boolean | null;
  value: (d: DayFactsExt) => number | null | undefined;
}

/** Расширенные факты дня: чек-ин нужен для сопоставления по стрессу. */
export interface DayFactsExt extends DayFacts {
  stress?: number;
}

const SPECS: ComparisonSpec[] = [
  {
    key: 'sleepVsKcal',
    inGroupA: (d) => (d.sleepMin == null ? null : d.sleepMin < 360),
    value: (d) => (d.hasDiary ? d.nutrients?.kcal : null),
  },
  {
    key: 'workoutVsKcal',
    inGroupA: (d) => d.workouts > 0,
    value: (d) => (d.hasDiary ? d.nutrients?.kcal : null),
  },
  {
    key: 'stressVsIndex',
    inGroupA: (d) => (d.stress == null ? null : d.stress >= 4),
    value: (d) => d.nutritionIndex,
  },
  {
    key: 'weekdayVsKcal',
    inGroupA: (d) => isoWeekday(d.date) >= 6,
    value: (d) => (d.hasDiary ? d.nutrients?.kcal : null),
  },
  {
    key: 'sleepVsHabits',
    inGroupA: (d) => (d.sleepMin == null ? null : d.sleepMin < 360),
    value: (d) =>
      d.habitsScheduled > 0 ? (d.habitsCompleted / d.habitsScheduled) * 100 : null,
  },
];

export function computeComparisons(days: DayFactsExt[]): ComparisonResult[] {
  return SPECS.map((spec) => {
    const a: number[] = [];
    const b: number[] = [];

    for (const day of days) {
      const group = spec.inGroupA(day);
      if (group == null) continue;
      const v = spec.value(day);
      if (v == null || Number.isNaN(v)) continue;
      (group ? a : b).push(v);
    }

    const available = a.length >= MIN_OBSERVATIONS && b.length >= MIN_OBSERVATIONS;
    const meanA = a.length ? round1(mean(a)) : null;
    const meanB = b.length ? round1(mean(b)) : null;

    return {
      key: spec.key,
      available,
      groupA: { n: a.length, mean: meanA },
      groupB: { n: b.length, mean: meanB },
      difference: available && meanA != null && meanB != null ? round1(meanA - meanB) : null,
    };
  });
}

function mean(v: number[]): number {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

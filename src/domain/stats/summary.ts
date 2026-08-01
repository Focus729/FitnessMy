/**
 * Периодические сводки — раздел 14.2.
 *
 * Обязательное требование ТЗ: рядом со средним всегда показывается число дней
 * с данными. Среднее по 3 дням из 7 не сопоставимо со средним по 7 из 7.
 */
import type { LocalDate, Nutrients } from '@/domain/model';

export interface PeriodMetric {
  /** Среднее по дням, В КОТОРЫХ БЫЛИ ДАННЫЕ. */
  average: number | null;
  /** Сумма за период. */
  total: number;
  /** Сколько дней с данными. */
  daysWithData: number;
  /** Сколько дней в периоде. */
  daysInPeriod: number;
  /** Изменение среднего к прошлому периоду (абсолютное). */
  changeVsPrev: number | null;
}

export function periodMetric(
  values: (number | null | undefined)[],
  daysInPeriod: number,
  prevAverage?: number | null,
): PeriodMetric {
  const present = values.filter((v): v is number => v != null && !Number.isNaN(v));
  const total = present.reduce((s, v) => s + v, 0);
  const average = present.length ? round2(total / present.length) : null;
  return {
    average,
    total: round2(total),
    daysWithData: present.length,
    daysInPeriod,
    changeVsPrev: average != null && prevAverage != null ? round2(average - prevAverage) : null,
  };
}

export interface DayFacts {
  date: LocalDate;
  nutrients?: Nutrients;
  hasDiary: boolean;
  weightKg?: number;
  workouts: number;
  volumeKg: number;
  sleepMin?: number;
  habitsScheduled: number;
  habitsCompleted: number;
  nutritionIndex?: number;
  steps?: number;
}

export interface PeriodSummary {
  from: LocalDate;
  to: LocalDate;
  daysInPeriod: number;
  kcal: PeriodMetric;
  proteinG: PeriodMetric;
  fatG: PeriodMetric;
  carbG: PeriodMetric;
  fiberG: PeriodMetric;
  loggedDays: number;
  weightChangeKg: number | null;
  workouts: number;
  volumeKg: number;
  sleepMin: PeriodMetric;
  habitCompletionPct: number | null;
  nutritionIndex: PeriodMetric;
  steps: PeriodMetric;
}

export function buildSummary(
  days: DayFacts[],
  prev?: PeriodSummary | null,
): PeriodSummary {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const n = sorted.length;
  const first = sorted[0];
  const last = sorted[n - 1];

  const weights = sorted.map((d) => d.weightKg).filter((w): w is number => w != null);
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];

  const scheduled = sorted.reduce((s, d) => s + d.habitsScheduled, 0);
  const completed = sorted.reduce((s, d) => s + Math.min(d.habitsCompleted, d.habitsScheduled), 0);

  return {
    from: first?.date ?? '',
    to: last?.date ?? '',
    daysInPeriod: n,
    kcal: periodMetric(sorted.map((d) => (d.hasDiary ? d.nutrients?.kcal : null)), n, prev?.kcal.average),
    proteinG: periodMetric(sorted.map((d) => (d.hasDiary ? d.nutrients?.proteinG : null)), n, prev?.proteinG.average),
    fatG: periodMetric(sorted.map((d) => (d.hasDiary ? d.nutrients?.fatG : null)), n, prev?.fatG.average),
    carbG: periodMetric(sorted.map((d) => (d.hasDiary ? d.nutrients?.carbG : null)), n, prev?.carbG.average),
    fiberG: periodMetric(sorted.map((d) => (d.hasDiary ? d.nutrients?.fiberG ?? 0 : null)), n, prev?.fiberG.average),
    loggedDays: sorted.filter((d) => d.hasDiary).length,
    weightChangeKg:
      firstWeight != null && lastWeight != null && weights.length > 1
        ? round2(lastWeight - firstWeight)
        : null,
    workouts: sorted.reduce((s, d) => s + d.workouts, 0),
    volumeKg: round2(sorted.reduce((s, d) => s + d.volumeKg, 0)),
    sleepMin: periodMetric(sorted.map((d) => d.sleepMin), n, prev?.sleepMin.average),
    habitCompletionPct: scheduled > 0 ? Math.round((completed / scheduled) * 100) : null,
    nutritionIndex: periodMetric(sorted.map((d) => d.nutritionIndex), n, prev?.nutritionIndex.average),
    steps: periodMetric(sorted.map((d) => d.steps), n, prev?.steps.average),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

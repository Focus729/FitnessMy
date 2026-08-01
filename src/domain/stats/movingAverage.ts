/**
 * Скользящее среднее — раздел 14.4.
 *
 * Центрированное среднее за 7 дней, на краях диапазона — доступное окно.
 * Пропуски интерполируются линейно, но интерполированные участки на графике
 * рисуются пунктиром, поэтому точка несёт флаг `interpolated`.
 *
 * Зачем это нужно (11.1): ежедневный вес шумит на ±1–2 кг из-за воды,
 * сырой график вводит в заблуждение и демотивирует.
 */
import type { LocalDate } from '@/domain/model';
import { dateRange } from '@/lib/date';

export interface SeriesPoint {
  date: LocalDate;
  value: number;
}

export interface SmoothedPoint {
  date: LocalDate;
  /** Сырое значение, если в этот день оно есть. */
  raw: number | null;
  /** Значение после линейной интерполяции пропусков. */
  filled: number | null;
  /** Центрированное среднее. */
  trend: number | null;
  /** true, если сырых данных в этот день не было. */
  interpolated: boolean;
}

/** Линейная интерполяция пропусков между известными точками. */
export function interpolateSeries(points: SeriesPoint[]): SmoothedPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return [];

  const byDate = new Map(sorted.map((p) => [p.date, p.value]));
  const dates = dateRange(first.date, last.date);

  const out: SmoothedPoint[] = dates.map((date) => ({
    date,
    raw: byDate.get(date) ?? null,
    filled: byDate.get(date) ?? null,
    trend: null,
    interpolated: !byDate.has(date),
  }));

  let prevIdx = -1;
  for (let i = 0; i < out.length; i++) {
    const point = out[i];
    if (!point || point.raw == null) continue;
    if (prevIdx >= 0 && i - prevIdx > 1) {
      const a = out[prevIdx];
      const b = point;
      if (a?.raw != null && b.raw != null) {
        const span = i - prevIdx;
        for (let k = 1; k < span; k++) {
          const gapPoint = out[prevIdx + k];
          if (gapPoint) gapPoint.filled = a.raw + (((b.raw as number) - a.raw) * k) / span;
        }
      }
    }
    prevIdx = i;
  }

  return out;
}

/**
 * Центрированное скользящее среднее.
 * На краях окно сжимается до доступного — линия не обрывается.
 */
export function movingAverage(points: SeriesPoint[], window = 7): SmoothedPoint[] {
  const series = interpolateSeries(points);
  const half = Math.floor(window / 2);

  return series.map((point, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(series.length - 1, i + half);
    const values: number[] = [];
    for (let k = from; k <= to; k++) {
      const v = series[k]?.filled;
      if (v != null) values.push(v);
    }
    const trend = values.length
      ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      : null;
    return { ...point, trend };
  });
}

/** Изменение тренда между первой и последней доступными точками. */
export function trendChange(points: SmoothedPoint[]): number | null {
  const withTrend = points.filter((p) => p.trend != null);
  const first = withTrend[0];
  const last = withTrend[withTrend.length - 1];
  if (!first || !last || first === last) return null;
  return Math.round(((last.trend as number) - (first.trend as number)) * 100) / 100;
}

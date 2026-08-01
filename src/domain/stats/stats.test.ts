import { describe, expect, it } from 'vitest';
import { interpolateSeries, movingAverage, trendChange } from './movingAverage';
import { buildSummary, periodMetric, type DayFacts } from './summary';
import { computeComparisons, MIN_OBSERVATIONS, type DayFactsExt } from './comparisons';
import ru from '@/i18n/ru.json';
import en from '@/i18n/en.json';

describe('скользящее среднее', () => {
  const points = [
    { date: '2026-07-01', value: 80 },
    { date: '2026-07-02', value: 81 },
    { date: '2026-07-03', value: 79 },
    { date: '2026-07-04', value: 80 },
    { date: '2026-07-05', value: 80 },
  ];

  it('сглаживает ежедневный шум', () => {
    const result = movingAverage(points, 7);
    expect(result).toHaveLength(5);
    expect(result[2]?.trend).toBeCloseTo(80, 1);
  });

  it('на краях диапазона использует доступное окно', () => {
    const result = movingAverage(points, 7);
    expect(result[0]?.trend).not.toBeNull();
    expect(result[4]?.trend).not.toBeNull();
  });

  it('пропуски интерполируются линейно и помечаются', () => {
    const result = interpolateSeries([
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-04', value: 83 },
    ]);
    expect(result).toHaveLength(4);
    expect(result[1]?.interpolated).toBe(true);
    expect(result[1]?.filled).toBeCloseTo(81, 5);
    expect(result[2]?.filled).toBeCloseTo(82, 5);
    expect(result[1]?.raw).toBeNull();
  });

  it('пустой ряд не ломается', () => {
    expect(movingAverage([], 7)).toEqual([]);
    expect(trendChange([])).toBeNull();
  });

  it('изменение тренда за период', () => {
    const result = movingAverage(
      [
        { date: '2026-07-01', value: 85 },
        { date: '2026-07-10', value: 80 },
      ],
      3,
    );
    expect(trendChange(result)).toBeLessThan(0);
  });
});

describe('периодические сводки', () => {
  it('среднее считается только по дням с данными', () => {
    const metric = periodMetric([2000, null, 2200, undefined], 4);
    expect(metric.average).toBe(2100);
    expect(metric.daysWithData).toBe(2);
    expect(metric.daysInPeriod).toBe(4);
  });

  it('изменение к прошлому периоду', () => {
    const metric = periodMetric([2100], 1, 2000);
    expect(metric.changeVsPrev).toBe(100);
  });

  it('нет данных — нет среднего', () => {
    expect(periodMetric([null, null], 2).average).toBeNull();
  });

  it('сводка собирает все показатели', () => {
    const days: DayFacts[] = [
      makeDay('2026-07-01', { kcal: 2000, weightKg: 80, workouts: 1, volumeKg: 5000 }),
      makeDay('2026-07-02', { kcal: 2200, weightKg: 79.5, workouts: 0, volumeKg: 0 }),
    ];
    const summary = buildSummary(days);
    expect(summary.kcal.average).toBe(2100);
    expect(summary.loggedDays).toBe(2);
    expect(summary.weightChangeKg).toBe(-0.5);
    expect(summary.workouts).toBe(1);
    expect(summary.volumeKg).toBe(5000);
    expect(summary.habitCompletionPct).toBe(100);
  });
});

describe('сопоставления', () => {
  it('не показываются, если наблюдений меньше 10 в любой группе', () => {
    const days = Array.from({ length: 12 }, (_, i) =>
      makeExt(`2026-07-${String(i + 1).padStart(2, '0')}`, { sleepMin: 300, kcal: 2500 }),
    );
    const results = computeComparisons(days);
    // группа B пуста — сопоставление недоступно
    expect(results.find((r) => r.key === 'sleepVsKcal')?.available).toBe(false);
  });

  it('показываются, когда в каждой группе не меньше 10 дней', () => {
    const days = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeExt(`2026-07-${String(i + 1).padStart(2, '0')}`, { sleepMin: 300, kcal: 2500 }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeExt(`2026-07-${String(i + 11).padStart(2, '0')}`, { sleepMin: 480, kcal: 2100 }),
      ),
    ];
    const result = computeComparisons(days).find((r) => r.key === 'sleepVsKcal');
    expect(result?.available).toBe(true);
    expect(result?.groupA.n).toBe(MIN_OBSERVATIONS);
    expect(result?.difference).toBe(400);
  });

  it('дни без данных из выборки исключаются', () => {
    const days = Array.from({ length: 20 }, (_, i) =>
      makeExt(`2026-07-${String(i + 1).padStart(2, '0')}`, { kcal: 2000 }),
    );
    expect(computeComparisons(days).find((r) => r.key === 'sleepVsKcal')?.groupA.n).toBe(0);
  });
});

describe('формулировки сопоставлений нейтральны (14.3)', () => {
  // ТЗ запрещает слова «влияет», «приводит к», «из-за», коэффициенты корреляции
  // и p-значения именно в САМИХ сопоставлениях. Пояснение под ними про
  // «не выводы о причинах» — законная формулировка и проверке не подлежит.
  const forbiddenRu = ['влия', 'приводит к', 'из-за', 'корреляц', 'p-знач'];
  const forbiddenEn = ['cause', 'leads to', 'because of', 'correlat', 'p-value'];

  it('русские сопоставления не содержат причинных формулировок', () => {
    const text = JSON.stringify(ru.progress.comparison).toLowerCase();
    for (const word of forbiddenRu) expect(text).not.toContain(word);
  });

  it('английские сопоставления не содержат причинных формулировок', () => {
    const text = JSON.stringify(en.progress.comparison).toLowerCase();
    for (const word of forbiddenEn) expect(text).not.toContain(word);
  });
});

function makeDay(date: string, patch: { kcal?: number; weightKg?: number; workouts?: number; volumeKg?: number }): DayFacts {
  return {
    date,
    nutrients: { kcal: patch.kcal ?? 0, proteinG: 100, fatG: 60, carbG: 200, fiberG: 20 },
    hasDiary: patch.kcal != null,
    weightKg: patch.weightKg,
    workouts: patch.workouts ?? 0,
    volumeKg: patch.volumeKg ?? 0,
    habitsScheduled: 2,
    habitsCompleted: 2,
  };
}

function makeExt(date: string, patch: { sleepMin?: number; kcal?: number }): DayFactsExt {
  return {
    date,
    nutrients: { kcal: patch.kcal ?? 0, proteinG: 0, fatG: 0, carbG: 0 },
    hasDiary: patch.kcal != null,
    workouts: 0,
    volumeKg: 0,
    sleepMin: patch.sleepMin,
    habitsScheduled: 0,
    habitsCompleted: 0,
  };
}

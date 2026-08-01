import { describe, expect, it } from 'vitest';
import {
  countWorkingSets,
  epley1RM,
  isWorkingSet,
  personalRecords,
  rirFromRpe,
  totalVolume,
  weightForReps,
} from './oneRm';
import { prefillFromLast, suggestProgression } from './progression';
import { nearestAchievable, planPlates, summarizePlates } from './plates';
import { estimateKcal, metFor, paceMinPerKm } from './met';

const set = (weightKg: number, reps: number, extra: Partial<{ type: 'normal' | 'warmup' | 'drop' | 'failure'; isCompleted: boolean; order: number }> = {}) => ({
  weightKg,
  reps,
  type: extra.type ?? ('normal' as const),
  isCompleted: extra.isCompleted ?? true,
  order: extra.order ?? 0,
  estimated1RM: epley1RM(weightKg, reps),
});

describe('оценка 1ПМ по Эпли', () => {
  it('один повтор равен весу', () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it('100 кг × 10 ≈ 133.3 кг', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.3, 1);
  });

  it('нулевые значения дают ноль', () => {
    expect(epley1RM(0, 10)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });

  it('обратный ход согласован с прямым', () => {
    expect(weightForReps(133.3, 10)).toBeCloseTo(100, 0);
    expect(weightForReps(0, 5)).toBe(0);
  });

  it('RIR = 10 − RPE', () => {
    expect(rirFromRpe(8)).toBe(2);
    expect(rirFromRpe(12)).toBe(0);
  });
});

describe('тоннаж', () => {
  it('разминочные подходы в тоннаж не входят', () => {
    const sets = [set(60, 10), set(60, 10), set(40, 10, { type: 'warmup' })];
    expect(totalVolume(sets)).toBe(1200);
    expect(countWorkingSets(sets)).toBe(2);
  });

  it('невыполненные подходы не считаются', () => {
    expect(totalVolume([set(100, 5, { isCompleted: false })])).toBe(0);
    expect(isWorkingSet(set(100, 5, { isCompleted: false }))).toBe(false);
  });

  it('личные рекорды по упражнению', () => {
    const records = personalRecords([set(100, 5), set(80, 12), set(120, 1)]);
    expect(records.maxWeightKg).toBe(120);
    expect(records.maxReps).toBe(12);
    // Максимум по всем подходам: 120×1 = 120 против 100×5 ≈ 116.7 и 80×12 = 112
    expect(records.max1RM).toBeCloseTo(120, 0);
  });

  it('пустая история даёт нули', () => {
    expect(personalRecords([]).max1RM).toBe(0);
  });
});

describe('двойная прогрессия', () => {
  const args = { targetRepsMin: 6, targetRepsMax: 10, bodyPart: 'upper' as const };

  it('все подходы на верхней границе — предлагает поднять вес', () => {
    const advice = suggestProgression({ ...args, lastSets: [set(60, 10), set(60, 10), set(60, 10)] });
    expect(advice).toEqual({ kind: 'increaseWeight', fromKg: 60, toKg: 62.5, reps: 6 });
  });

  it('для низа тела шаг 5 кг', () => {
    const advice = suggestProgression({
      ...args,
      bodyPart: 'lower',
      lastSets: [set(100, 10), set(100, 10)],
    });
    expect(advice).toMatchObject({ kind: 'increaseWeight', toKg: 105 });
  });

  it('повторы не на верхней границе — предлагает +1 повтор', () => {
    const advice = suggestProgression({ ...args, lastSets: [set(60, 8), set(60, 7)] });
    expect(advice).toEqual({ kind: 'increaseReps', weightKg: 60, reps: 9 });
  });

  it('вес стоит три тренировки — предлагает разгрузку 10%', () => {
    const advice = suggestProgression({
      ...args,
      lastSets: [set(60, 8)],
      recentTopWeights: [60, 60, 60],
    });
    expect(advice).toEqual({ kind: 'deload', fromKg: 60, toKg: 54 });
  });

  it('без истории — нет подсказки', () => {
    expect(suggestProgression({ ...args, lastSets: [] })).toEqual({ kind: 'noData' });
  });
});

describe('предзаполнение прошлыми значениями', () => {
  const lastSets = [set(60, 8, { order: 0 }), set(60, 7, { order: 1 }), set(55, 6, { order: 2 })];

  it('берёт подход с тем же номером', () => {
    expect(prefillFromLast(lastSets, 1)).toEqual({ weightKg: 60, reps: 7 });
  });

  it('за пределами истории берёт последний', () => {
    expect(prefillFromLast(lastSets, 9)).toEqual({ weightKg: 55, reps: 6 });
  });

  it('без истории ничего не предлагает', () => {
    expect(prefillFromLast([], 0)).toBeUndefined();
  });
});

describe('план блинов', () => {
  it('100 кг на грифе 20 кг — по 40 кг на сторону', () => {
    const plan = planPlates(100, 20);
    expect(plan.perSide).toEqual([25, 15]);
    expect(plan.achievableKg).toBe(100);
    expect(plan.exact).toBe(true);
  });

  it('вес меньше грифа — блинов нет', () => {
    expect(planPlates(15, 20).perSide).toEqual([]);
  });

  it('нечётный вес округляется вниз и помечается как неточный', () => {
    const plan = planPlates(101, 20);
    expect(plan.exact).toBe(false);
    expect(plan.achievableKg).toBeLessThan(101);
  });

  it('ближайший достижимый вес', () => {
    expect(nearestAchievable(101, 20)).toBe(100);
    expect(nearestAchievable(102.4, 20)).toBe(102.5);
  });

  it('сводка группирует одинаковые блины', () => {
    expect(summarizePlates([25, 25, 10, 2.5])).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });

  it('учитывает нестандартный набор блинов', () => {
    const plan = planPlates(60, 20, [20, 10]);
    expect(plan.perSide).toEqual([20]);
    expect(plan.achievableKg).toBe(60);
  });
});

describe('оценка кардио по МЕТ', () => {
  it('быстрый бег имеет больший МЕТ, чем медленный', () => {
    const slow = metFor('run', 3600, 8000);
    const fast = metFor('run', 3600, 14000);
    expect(fast).toBeGreaterThan(slow);
  });

  it('без дистанции берётся значение по умолчанию', () => {
    expect(metFor('swim', 1800)).toBe(7);
  });

  it('ккал = МЕТ × вес × часы', () => {
    // ходьба 3.5 МЕТ, 80 кг, 1 час
    expect(estimateKcal({ kind: 'walk', durationSec: 3600, weightKg: 80 })).toBe(280);
  });

  it('темп в минутах на километр', () => {
    expect(paceMinPerKm(1800, 5000)).toBe(6);
    expect(paceMinPerKm(1800, 0)).toBeUndefined();
  });

  it('велосипед уточняется по скорости', () => {
    expect(metFor('bike', 3600, 25000)).toBe(10);
    expect(metFor('walk', 3600, 3000)).toBe(2.8);
  });
});

import { describe, expect, it } from 'vitest';
import {
  bmrKatchMcArdle,
  bmrMifflin,
  calculateTargets,
  goalKcal,
  safetyCheck,
  shouldOfferRecalc,
  tdeeFor,
} from './targets';

describe('основной обмен', () => {
  it('Mifflin-St Jeor для мужчины', () => {
    // 10·80 + 6.25·180 − 5·30 + 5 = 800 + 1125 − 150 + 5
    expect(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780);
  });

  it('Mifflin-St Jeor для женщины', () => {
    expect(bmrMifflin({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })).toBe(1320.25);
  });

  it('Katch-McArdle по проценту жира', () => {
    // LBM = 80 · 0.8 = 64; 370 + 21.6·64
    expect(bmrKatchMcArdle(80, 20)).toBeCloseTo(1752.4, 1);
  });
});

describe('суточный расход и цель', () => {
  it('умножает на коэффициент активности', () => {
    expect(tdeeFor(1780, 1.55)).toBeCloseTo(2759, 0);
  });

  it('дефицит 0.5 кг в неделю — это 550 ккал в день', () => {
    expect(goalKcal(2500, -0.5)).toBeCloseTo(2500 - 550, 0);
  });

  it('поддержание не меняет расход', () => {
    expect(goalKcal(2500, 0)).toBe(2500);
  });
});

describe('ограничитель безопасности', () => {
  it('предупреждает, если цель ниже основного обмена', () => {
    const warnings = safetyCheck({ kcal: 1400, bmr: 1600, sex: 'male', goalRatePerWeekKg: -0.5, weightKg: 80 });
    expect(warnings.map((w) => w.kind)).toContain('belowBmr');
  });

  it('предупреждает о нижней границе 1200 для женщин', () => {
    const warnings = safetyCheck({ kcal: 1100, bmr: 1000, sex: 'female', goalRatePerWeekKg: -0.5, weightKg: 60 });
    expect(warnings.map((w) => w.kind)).toContain('belowFloor');
  });

  it('мужская граница — 1500', () => {
    const warnings = safetyCheck({ kcal: 1400, bmr: 1300, sex: 'male', goalRatePerWeekKg: -0.5, weightKg: 80 });
    expect(warnings.map((w) => w.kind)).toContain('belowFloor');
  });

  it('предупреждает о слишком быстром темпе', () => {
    const warnings = safetyCheck({ kcal: 2000, bmr: 1600, sex: 'male', goalRatePerWeekKg: -1, weightKg: 70 });
    expect(warnings.map((w) => w.kind)).toContain('fastRate');
  });

  it('спокойный план предупреждений не даёт', () => {
    expect(
      safetyCheck({ kcal: 2200, bmr: 1700, sex: 'male', goalRatePerWeekKg: -0.4, weightKg: 80 }),
    ).toEqual([]);
  });
});

describe('полный расчёт нормы', () => {
  const input = {
    sex: 'male' as const,
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 1.55 as const,
    goalRatePerWeekKg: -0.5,
  };

  it('белок — 1.8 г на кг', () => {
    expect(calculateTargets(input).targets.proteinG).toBe(144);
  });

  it('жир не опускается ниже 20% калорий', () => {
    const result = calculateTargets({ ...input, fatPerKg: 0.1 });
    expect(result.targets.fatG * 9).toBeGreaterThanOrEqual(result.targets.kcal * 0.2 - 9);
  });

  it('углеводы добирают остаток калорий', () => {
    const { targets } = calculateTargets(input);
    const sum = targets.proteinG * 4 + targets.fatG * 9 + targets.carbG * 4;
    expect(Math.abs(sum - targets.kcal)).toBeLessThan(10);
  });

  it('клетчатка — 14 г на 1000 ккал', () => {
    const { targets } = calculateTargets(input);
    expect(targets.fiberG).toBe(Math.round((14 * targets.kcal) / 1000));
  });

  it('сахар — 10% калорий', () => {
    const { targets } = calculateTargets(input);
    expect(targets.sugarMaxG).toBe(Math.round((targets.kcal * 0.1) / 4));
  });

  it('натрий — 2000 мг', () => {
    expect(calculateTargets(input).targets.sodiumMaxMg).toBe(2000);
  });

  it('вода — 30 мл на кг, плюс 500 в дни тренировок', () => {
    expect(calculateTargets(input).targets.waterMl).toBe(2400);
    expect(calculateTargets(input, true).targets.waterMl).toBe(2900);
  });

  it('процент жира переключает формулу на Кэтча-Макардла', () => {
    expect(calculateTargets({ ...input, bodyFatPct: 20 }).formula).toBe('katch');
    expect(calculateTargets(input).formula).toBe('mifflin');
  });

  it('белок ограничен диапазоном 1.2–2.5 г/кг', () => {
    expect(calculateTargets({ ...input, proteinPerKg: 5 }).targets.proteinG).toBe(200);
    expect(calculateTargets({ ...input, proteinPerKg: 0.1 }).targets.proteinG).toBe(96);
  });
});

describe('пересчёт при изменении веса', () => {
  const targets = calculateTargets({
    sex: 'male',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityLevel: 1.55,
    goalRatePerWeekKg: -0.5,
  }).targets;

  it('не предлагает пересчёт при изменении меньше 2 кг', () => {
    expect(shouldOfferRecalc(targets, 78.5)).toBe(false);
  });

  it('предлагает пересчёт при изменении больше 2 кг', () => {
    expect(shouldOfferRecalc(targets, 77)).toBe(true);
  });

  it('не трогает ручной режим', () => {
    expect(shouldOfferRecalc({ ...targets, mode: 'manual' }, 70)).toBe(false);
  });
});

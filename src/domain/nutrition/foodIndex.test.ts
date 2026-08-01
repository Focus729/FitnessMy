import { describe, expect, it } from 'vitest';
import { computeFoodIndex, varietyScore } from './foodIndex';

const targets = { proteinG: 150, fiberG: 30, sugarMaxG: 50, sodiumMaxMg: 2000 };

describe('индекс питания', () => {
  it('идеальный день даёт 100', () => {
    const result = computeFoodIndex({
      totals: { kcal: 2000, proteinG: 150, fatG: 60, carbG: 200, fiberG: 30, sugarG: 10, sodiumMg: 1000 },
      targets,
      distinctFoods: 30,
      nova: { group4Grams: 0, knownGrams: 1000 },
    });
    expect(result.score).toBe(100);
  });

  it('пустой день не набирает баллов за белок, клетчатку и разнообразие', () => {
    const result = computeFoodIndex({
      totals: { kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0 },
      targets,
      distinctFoods: 0,
    });
    for (const key of ['protein', 'fiber', 'variety'] as const) {
      expect(result.components.find((c) => c.key === key)?.points).toBe(0);
    }
    // Сахар и натрий по формуле из 9.6 дают полный балл, пока они ниже границы,
    // поэтому пустой день — это ровно их вес, а не ноль.
    const limits = result.components.filter((c) => c.key === 'sugar' || c.key === 'sodium');
    expect(result.score).toBe(Math.round(limits.reduce((s, c) => s + c.weight, 0)));
  });

  it('превышение белка выше цели баллов не добавляет', () => {
    const at = computeFoodIndex({ totals: base({ proteinG: 150 }), targets, distinctFoods: 0 });
    const over = computeFoodIndex({ totals: base({ proteinG: 300 }), targets, distinctFoods: 0 });
    expect(over.score).toBe(at.score);
  });

  it('сахар падает до нуля при двукратном превышении', () => {
    const result = computeFoodIndex({ totals: base({ sugarG: 100 }), targets, distinctFoods: 0 });
    expect(result.components.find((c) => c.key === 'sugar')?.points).toBe(0);
  });

  it('сахар ниже границы даёт полный балл', () => {
    const result = computeFoodIndex({ totals: base({ sugarG: 20 }), targets, distinctFoods: 0 });
    const sugar = result.components.find((c) => c.key === 'sugar');
    expect(sugar?.points).toBe(sugar?.weight);
  });

  it('без данных NOVA компонент исключается, а веса перераспределяются', () => {
    const result = computeFoodIndex({ totals: base({}), targets, distinctFoods: 0 });
    const processing = result.components.find((c) => c.key === 'processing');
    expect(processing?.applicable).toBe(false);
    expect(processing?.weight).toBe(0);
    const total = result.components.reduce((s, c) => s + c.weight, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('разнообразие: 0 при менее 10 продуктов, максимум при 30', () => {
    expect(varietyScore(9)).toBe(0);
    expect(varietyScore(20)).toBeCloseTo(0.5, 5);
    expect(varietyScore(30)).toBe(1);
    expect(varietyScore(100)).toBe(1);
  });

  it('разбор возвращает цифры по каждому компоненту', () => {
    const result = computeFoodIndex({ totals: base({ proteinG: 75 }), targets, distinctFoods: 15 });
    const protein = result.components.find((c) => c.key === 'protein');
    expect(protein?.value).toBe(75);
    expect(protein?.target).toBe(150);
    expect(protein?.score).toBeCloseTo(0.5, 5);
  });
});

function base(patch: Partial<Record<string, number>>) {
  return {
    kcal: 2000,
    proteinG: 0,
    fatG: 0,
    carbG: 0,
    fiberG: 0,
    sugarG: 0,
    sodiumMg: 0,
    ...patch,
  };
}

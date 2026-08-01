import { describe, expect, it } from 'vitest';
import { computeDish, computeRecipe } from './recipe';
import { add, alcoholKcal, ethanolMl, kcalFromMacros, mul, scale, sum, sumEntries, ZERO } from './nutrients';

const rice = { kcal: 344, proteinG: 6.7, fatG: 0.7, carbG: 78.9, fiberG: 1.3 };
const chicken = { kcal: 120, proteinG: 22.5, fatG: 2.6, carbG: 0 };

describe('арифметика нутриентов', () => {
  it('масштабирует на граммы', () => {
    expect(scale(chicken, 200).proteinG).toBe(45);
    expect(scale(chicken, 50).kcal).toBe(60);
  });

  it('складывает', () => {
    expect(add(chicken, chicken).kcal).toBe(240);
  });

  it('суммирует список', () => {
    expect(sum([chicken, chicken, chicken]).proteinG).toBe(67.5);
    expect(sum([])).toEqual(ZERO);
  });

  it('суммирует записи дневника', () => {
    expect(sumEntries([{ nutrients: chicken }, { nutrients: rice }]).kcal).toBe(464);
  });

  it('умножает на коэффициент', () => {
    expect(mul(chicken, 0.5).kcal).toBe(60);
  });

  it('считает калории по Атуотеру', () => {
    expect(kcalFromMacros({ proteinG: 10, fatG: 10, carbG: 10 })).toBe(170);
  });

  it('переводит объём напитка в чистый спирт и калории', () => {
    expect(ethanolMl(150, 12)).toBe(18);
    // 18 мл · 0.789 г/мл · 7 ккал/г
    expect(alcoholKcal(18)).toBe(99);
  });
});

describe('блюдо', () => {
  it('складывает компоненты и считает ценность на 100 г', () => {
    const result = computeDish([
      { grams: 200, per100: chicken },
      { grams: 100, per100: rice },
    ]);
    expect(result.totalGrams).toBe(300);
    expect(result.total.kcal).toBe(584);
    expect(result.per100.kcal).toBeCloseTo(194.67, 1);
  });

  it('пустое блюдо не делит на ноль', () => {
    expect(computeDish([]).per100).toEqual(ZERO);
  });
});

describe('рецепт с уварочным коэффициентом', () => {
  it('ценность на 100 г готового считается от веса ГОТОВОГО блюда', () => {
    // 100 г сухого риса (344 ккал) даёт 300 г отварного
    const result = computeRecipe([{ grams: 100, per100: rice }], 300, 3);
    expect(result.rawGrams).toBe(100);
    expect(result.yieldGrams).toBe(300);
    expect(result.yieldFactor).toBe(3);
    expect(result.per100Cooked.kcal).toBeCloseTo(114.67, 1);
    expect(result.servingGrams).toBe(100);
    expect(result.perServing.kcal).toBeCloseTo(114.67, 1);
  });

  it('уварка уменьшает вес и повышает плотность', () => {
    const result = computeRecipe([{ grams: 500, per100: chicken }], 350, 2);
    expect(result.yieldFactor).toBeCloseTo(0.7, 2);
    expect(result.per100Cooked.kcal).toBeGreaterThan(chicken.kcal);
    expect(result.servingGrams).toBe(175);
  });

  it('сумма нутриентов при готовке не меняется', () => {
    const raw = computeRecipe([{ grams: 500, per100: chicken }], 350, 1);
    expect(raw.total.kcal).toBe(600);
    expect(raw.perServing.kcal).toBe(600);
  });

  it('без указанного веса готового берёт сырой', () => {
    const result = computeRecipe([{ grams: 200, per100: chicken }], 0, 2);
    expect(result.yieldGrams).toBe(200);
    expect(result.yieldFactor).toBe(1);
  });

  it('число порций не меньше одной', () => {
    expect(computeRecipe([{ grams: 100, per100: chicken }], 100, 0).servingGrams).toBe(100);
  });
});

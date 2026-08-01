/**
 * Рецепты с уварочным коэффициентом — раздел 9.3.
 *
 * «Это то место, где большинство приложений ошибаются». Суть: сумма нутриентов
 * ингредиентов при готовке не меняется, а масса меняется. Значит, ценность
 * 100 г ГОТОВОГО блюда = сумма нутриентов / вес готового × 100.
 */
import type { Nutrients } from '@/domain/model';
import { add, mul, scale, ZERO, round2 } from './nutrients';

export interface ComponentWithFood {
  grams: number;
  per100: Nutrients;
}

export interface RecipeMath {
  /** Сумма по всем ингредиентам. */
  total: Nutrients;
  /** Сырой вес ингредиентов. */
  rawGrams: number;
  /** Вес готового блюда. */
  yieldGrams: number;
  /** yieldGrams / rawGrams. < 1 — уварилось, > 1 — впитало воду. */
  yieldFactor: number;
  /** Ценность 100 г готового блюда. */
  per100Cooked: Nutrients;
  /** Ценность одной порции. */
  perServing: Nutrients;
  servingGrams: number;
}

function totalOf(components: ComponentWithFood[]): Nutrients {
  return components.reduce<Nutrients>((acc, c) => add(acc, scale(c.per100, c.grams)), { ...ZERO });
}

export function computeRecipe(
  components: ComponentWithFood[],
  yieldGrams: number,
  servings: number,
): RecipeMath {
  const total = totalOf(components);
  const rawGrams = components.reduce((s, c) => s + c.grams, 0);
  const finalGrams = yieldGrams > 0 ? yieldGrams : rawGrams;
  const portions = Math.max(1, Math.round(servings));

  return {
    total,
    rawGrams: round2(rawGrams),
    yieldGrams: round2(finalGrams),
    yieldFactor: rawGrams > 0 ? round2(finalGrams / rawGrams) : 1,
    per100Cooked: finalGrams > 0 ? mul(total, 100 / finalGrams) : { ...ZERO },
    perServing: mul(total, 1 / portions),
    servingGrams: round2(finalGrams / portions),
  };
}

/** Блюдо — фиксированная комбинация без уварки (9.3). */
export function computeDish(components: ComponentWithFood[]): {
  total: Nutrients;
  totalGrams: number;
  per100: Nutrients;
} {
  const total = totalOf(components);
  const totalGrams = components.reduce((s, c) => s + c.grams, 0);
  return {
    total,
    totalGrams: round2(totalGrams),
    per100: totalGrams > 0 ? mul(total, 100 / totalGrams) : { ...ZERO },
  };
}

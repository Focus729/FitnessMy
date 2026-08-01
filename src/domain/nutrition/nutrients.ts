/** Арифметика нутриентов. Всё считается на граммах, per100 — на 100 г/мл. */
import type { DiaryEntry, Nutrients } from '@/domain/model';

export const ZERO: Nutrients = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };

const KEYS = [
  'kcal',
  'proteinG',
  'fatG',
  'satFatG',
  'carbG',
  'sugarG',
  'fiberG',
  'sodiumMg',
] as const;

/** Умножение всех нутриентов на коэффициент. */
export function mul(n: Nutrients, factor: number): Nutrients {
  const out: Nutrients = { ...ZERO };
  for (const key of KEYS) {
    const v = n[key];
    if (v != null) out[key] = round2(v * factor);
  }
  return out;
}

/** Ценность порции в `grams` для продукта, заданного на 100 г/мл. */
export function scale(per100: Nutrients, grams: number): Nutrients {
  return mul(per100, grams / 100);
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = { ...ZERO };
  for (const key of KEYS) {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) continue;
    out[key] = round2((av ?? 0) + (bv ?? 0));
  }
  return out;
}

export function sum(list: Nutrients[]): Nutrients {
  return list.reduce(add, { ...ZERO });
}

export function sumEntries(entries: Pick<DiaryEntry, 'nutrients'>[]): Nutrients {
  return sum(entries.map((e) => e.nutrients));
}

/** Ккал по Атуотеру — для проверки и для продуктов без указанной энергии. */
export function kcalFromMacros(n: Pick<Nutrients, 'proteinG' | 'fatG' | 'carbG'>): number {
  return round2(n.proteinG * 4 + n.fatG * 9 + n.carbG * 4);
}

/** 9.4: алкоголь идёт и в калории — 7 ккал на грамм этанола, плотность 0.789 г/мл. */
export function alcoholKcal(mlEthanol: number): number {
  return Math.round(mlEthanol * 0.789 * 7);
}

/** мл напитка × крепость (%) → мл чистого спирта. */
export function ethanolMl(volumeMl: number, abvPercent: number): number {
  return round2((volumeMl * abvPercent) / 100);
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Доля выполнения цели, ограниченная сверху — для полос на главном экране. */
export function ratio(value: number, target: number): number {
  if (target <= 0) return 0;
  return value / target;
}

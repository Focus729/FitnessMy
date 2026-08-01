/**
 * USDA FoodData Central — раздел 7.1, слой 2.
 *
 * Требуется бесплатный ключ api.data.gov. Ключ вшивается в сборку через
 * VITE_USDA_API_KEY; при его отсутствии адаптер просто отключён, и это не
 * ломает приложение (правило 5.3).
 */
import { searchKeyFor } from '@/domain/nutrition/search';
import { assertOnline, FoodSourceError, type ExternalFood, type FoodSourceAdapter } from './types';

const BASE = 'https://api.nal.usda.gov/fdc/v1';
const API_KEY = (import.meta.env?.VITE_USDA_API_KEY as string | undefined) ?? '';

/** Номера нутриентов FDC. */
const NUTRIENT = {
  kcal: 1008,
  protein: 1003,
  fat: 1004,
  satFat: 1258,
  carb: 1005,
  sugar: 2000,
  fiber: 1079,
  sodium: 1093,
} as const;

interface FdcNutrient {
  nutrientId?: number;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  gtinUpc?: string;
  foodNutrients?: FdcNutrient[];
}

export function isUsdaAvailable(): boolean {
  return API_KEY.length > 0;
}

function pick(nutrients: FdcNutrient[] | undefined, id: number): number | undefined {
  return nutrients?.find((n) => n.nutrientId === id)?.value;
}

function toFood(f: FdcFood): ExternalFood | null {
  const kcal = pick(f.foodNutrients, NUTRIENT.kcal);
  if (kcal == null) return null;

  const base = {
    source: 'usda' as const,
    externalId: String(f.fdcId),
    name: f.description,
    nameI18n: { en: f.description },
    brand: f.brandOwner,
    barcode: f.gtinUpc,
    per100: {
      kcal: Math.round(kcal),
      proteinG: round1(pick(f.foodNutrients, NUTRIENT.protein) ?? 0),
      fatG: round1(pick(f.foodNutrients, NUTRIENT.fat) ?? 0),
      satFatG: round1o(pick(f.foodNutrients, NUTRIENT.satFat)),
      carbG: round1(pick(f.foodNutrients, NUTRIENT.carb) ?? 0),
      sugarG: round1o(pick(f.foodNutrients, NUTRIENT.sugar)),
      fiberG: round1o(pick(f.foodNutrients, NUTRIENT.fiber)),
      sodiumMg: pick(f.foodNutrients, NUTRIENT.sodium),
    },
    servings: [],
    basis: 'mass' as const,
  };

  return { ...base, searchKey: searchKeyFor(base) };
}

export const usda: FoodSourceAdapter = {
  id: 'usda',

  async searchByName(query, signal) {
    if (!isUsdaAvailable()) return [];
    assertOnline();
    const url =
      `${BASE}/foods/search?api_key=${API_KEY}&query=${encodeURIComponent(query)}` +
      `&pageSize=20&dataType=Foundation,SR%20Legacy,Branded`;
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch {
      throw new FoodSourceError('network');
    }
    if (!res.ok) throw new FoodSourceError('network');
    const data = (await res.json()) as { foods?: FdcFood[] };
    return (data.foods ?? []).map(toFood).filter((f): f is ExternalFood => f !== null);
  },
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round1o(v: number | undefined): number | undefined {
  return v == null ? undefined : round1(v);
}

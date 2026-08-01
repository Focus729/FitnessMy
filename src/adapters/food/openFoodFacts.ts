/**
 * Open Food Facts — раздел 7.1, слой 2.
 *
 * Бесплатно, ключ не нужен. Атрибуция обязательна и выведена в разделе
 * «О приложении». Найденный продукт немедленно копируется в локальную базу,
 * второй раз сеть уже не понадобится.
 *
 * Юридически: обращение к API и локальное кэширование для собственного
 * пользователя — обычный сценарий и обязательств ODbL не создаёт. Выгрузку OFF
 * во встроенный набор включать нельзя (см. врезку в 7.1).
 */
import { searchKeyFor } from '@/domain/nutrition/search';
import { assertOnline, FoodSourceError, type ExternalFood, type FoodSourceAdapter } from './types';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS =
  'code,product_name,product_name_ru,product_name_en,brands,nutriments,serving_quantity,serving_size,nova_group,quantity';

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  product_name_en?: string;
  brands?: string;
  nova_group?: number;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function n(value: number | string | undefined): number | undefined {
  if (value == null) return undefined;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFood(p: OffProduct): ExternalFood | null {
  const name = p.product_name_ru || p.product_name || p.product_name_en;
  const nut = p.nutriments ?? {};
  const kcal = n(nut['energy-kcal_100g']) ?? (n(nut['energy_100g']) ?? 0) / 4.184;
  if (!name || !Number.isFinite(kcal)) return null;

  const servingGrams = n(p.serving_quantity);
  const base = {
    source: 'off' as const,
    externalId: p.code,
    name,
    nameI18n: {
      ru: p.product_name_ru || undefined,
      en: p.product_name_en || p.product_name || undefined,
    },
    brand: p.brands?.split(',')[0]?.trim(),
    barcode: p.code,
    per100: {
      kcal: Math.round(kcal),
      proteinG: round1(n(nut['proteins_100g']) ?? 0),
      fatG: round1(n(nut['fat_100g']) ?? 0),
      satFatG: round1o(n(nut['saturated-fat_100g'])),
      carbG: round1(n(nut['carbohydrates_100g']) ?? 0),
      sugarG: round1o(n(nut['sugars_100g'])),
      fiberG: round1o(n(nut['fiber_100g'])),
      sodiumMg: n(nut['sodium_100g']) != null ? Math.round((n(nut['sodium_100g']) as number) * 1000) : undefined,
    },
    servings:
      servingGrams && servingGrams > 0
        ? [{ id: 'off-serving', name: p.serving_size ?? '1', grams: servingGrams, isDefault: true }]
        : [],
    basis: 'mass' as const,
    novaGroup: (p.nova_group as 1 | 2 | 3 | 4 | undefined) ?? undefined,
  };

  return { ...base, searchKey: searchKeyFor(base) };
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  assertOnline();
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch {
    throw new FoodSourceError('network');
  }
  if (res.status === 404) throw new FoodSourceError('notFound');
  if (!res.ok) throw new FoodSourceError('network');
  return (await res.json()) as T;
}

export const openFoodFacts: FoodSourceAdapter = {
  id: 'off',

  async searchByName(query, signal) {
    const url =
      `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
    const data = await request<{ products?: OffProduct[] }>(url, signal);
    return (data.products ?? []).map(toFood).filter((f): f is ExternalFood => f !== null);
  },

  async findByBarcode(barcode, signal) {
    const url = `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
    const data = await request<{ status?: number; product?: OffProduct }>(url, signal);
    if (data.status !== 1 || !data.product) return null;
    return toFood(data.product);
  },
};

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round1o(v: number | undefined): number | undefined {
  return v == null ? undefined : round1(v);
}

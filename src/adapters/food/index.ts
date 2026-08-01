/**
 * Объединённый поиск по внешним справочникам.
 * Запускается ТОЛЬКО по явному нажатию пользователя (7.1, пункт 6).
 */
import type { Repositories } from '@/data/repositories/types';
import type { Food } from '@/domain/model';
import { openFoodFacts } from './openFoodFacts';
import { isUsdaAvailable, usda } from './usda';
import { FoodSourceError, type ExternalFood } from './types';

export { FoodSourceError } from './types';
export type { ExternalFood } from './types';
export { isUsdaAvailable } from './usda';

export async function searchOnline(query: string, signal?: AbortSignal): Promise<ExternalFood[]> {
  const sources = [openFoodFacts, ...(isUsdaAvailable() ? [usda] : [])];
  const results = await Promise.allSettled(
    sources.map((s) => s.searchByName(query, signal)),
  );

  const found = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (found.length === 0 && results.every((r) => r.status === 'rejected')) {
    const first = results[0];
    if (first && first.status === 'rejected' && first.reason instanceof FoodSourceError) {
      throw first.reason;
    }
    throw new FoodSourceError('network');
  }
  return found;
}

export async function findByBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<ExternalFood | null> {
  return openFoodFacts.findByBarcode?.(barcode, signal) ?? null;
}

/**
 * Сохраняет найденный продукт в локальную базу.
 * «Второй раз сеть уже не понадобится» (7.1).
 */
export async function cacheExternalFood(
  repos: Repositories,
  external: ExternalFood,
): Promise<Food> {
  const existing = external.externalId
    ? await repos.foods.byExternalId(external.source, external.externalId)
    : undefined;
  if (existing) return existing;

  return repos.foods.create({
    ...external,
    isFavorite: false,
    useCount: 0,
    verified: false,
  });
}

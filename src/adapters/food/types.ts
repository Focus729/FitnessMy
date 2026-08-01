/**
 * Внешние справочники продуктов — раздел 7.1, слой 2.
 *
 * Правило 5.3: любой внешний адаптер может отсутствовать. Приложение обязано
 * полностью работать при отключённой сети — эти адаптеры вызываются ТОЛЬКО
 * по явному действию пользователя («Искать в интернете», сканирование).
 */
import type { Food } from '@/domain/model';

export type ExternalFood = Omit<
  Food,
  'id' | 'createdAt' | 'updatedAt' | 'isFavorite' | 'useCount' | 'verified'
>;

export interface FoodSourceAdapter {
  readonly id: 'off' | 'usda';
  /** Поиск по названию. */
  searchByName(query: string, signal?: AbortSignal): Promise<ExternalFood[]>;
  /** Поиск по штрихкоду. Не все источники это умеют. */
  findByBarcode?(barcode: string, signal?: AbortSignal): Promise<ExternalFood | null>;
}

export class FoodSourceError extends Error {
  constructor(public readonly kind: 'offline' | 'network' | 'notFound') {
    super(kind);
    this.name = 'FoodSourceError';
  }
}

export function assertOnline(): void {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new FoodSourceError('offline');
  }
}

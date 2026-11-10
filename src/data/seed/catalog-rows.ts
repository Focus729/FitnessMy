import type { Exercise, Food } from '../../domain/model';

type SeedFood = Omit<
  Food,
  'source' | 'isFavorite' | 'useCount' | 'verified' | 'createdAt' | 'updatedAt'
>;
type SeedExercise = Omit<
  Exercise,
  'source' | 'isCustom' | 'isFavorite' | 'createdAt' | 'updatedAt'
>;

export interface CatalogRows {
  foods: ReadonlyMap<string, Omit<Food, 'createdAt' | 'updatedAt'>>;
  exercises: ReadonlyMap<string, Omit<Exercise, 'createdAt' | 'updatedAt'>>;
}

let cached: Promise<CatalogRows> | undefined;
export function loadCatalogRows(): Promise<CatalogRows> {
  cached ??= Promise.all([
    import('./foods.json') as Promise<{ default: SeedFood[] }>,
    import('./exercises.json') as Promise<{ default: SeedExercise[] }>,
  ])
    .then(([{ default: foods }, { default: exercises }]) => ({
      foods: new Map(
        foods.map((row) => [
          row.id,
          {
            ...row,
            source: 'seed' as const,
            isFavorite: false,
            useCount: 0,
            verified: true,
          },
        ]),
      ),
      exercises: new Map(
        exercises.map((row) => [
          row.id,
          {
            ...row,
            source: 'seed' as const,
            isCustom: false,
            isFavorite: false,
          },
        ]),
      ),
    }))
    .catch((error) => {
      cached = undefined;
      throw error;
    });
  return cached;
}

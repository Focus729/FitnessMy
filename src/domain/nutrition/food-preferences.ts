export const MAX_PREFERRED_INGREDIENTS = 50;
export const MAX_EXCLUDED_INGREDIENTS = 200;

export function validPreferredIngredients(value: unknown): value is string[] {
  return validIngredientIds(value, MAX_PREFERRED_INGREDIENTS);
}

export function validExcludedIngredients(value: unknown): value is string[] {
  return validIngredientIds(value, MAX_EXCLUDED_INGREDIENTS);
}

function validIngredientIds(value: unknown, limit: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= limit &&
    new Set(value).size === value.length &&
    value.every(
      (id) =>
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= 200 &&
        !Array.from(id).some((char) => char.charCodeAt(0) < 32),
    )
  );
}

export const FOOD_PREFERENCES_HEADER = "X-FitnessMy-Food-Preferences";

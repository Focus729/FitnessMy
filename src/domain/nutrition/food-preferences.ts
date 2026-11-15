export const MAX_PREFERRED_INGREDIENTS = 50;

export function validPreferredIngredients(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PREFERRED_INGREDIENTS &&
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

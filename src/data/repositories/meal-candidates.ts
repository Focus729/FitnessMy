import type { Repositories } from "./types";
import type { MealCandidate } from "@/domain/nutrition/daily-plan";
import { macroKeys } from "@/domain/nutrition/daily-plan";
import { computeDish, computeRecipe } from "@/domain/nutrition/recipe";
import { scale } from "@/domain/nutrition/nutrients";

const mains = ["lunch", "dinner"];
const starters = [
  [
    "oats",
    "Овсянка с йогуртом и бананом",
    "Oats with yogurt and banana",
    ["breakfast", "snack"],
    [
      ["oatmeal-cooked-in-water", 240],
      ["greek-yogurt-2-fat", 170],
      ["banana-raw", 110],
    ],
  ],
  [
    "eggs",
    "Яйца с картофелем и томатами",
    "Eggs with potatoes and tomatoes",
    ["breakfast", ...mains],
    [
      ["egg-hard-boiled", 100],
      ["potato-boiled", 200],
      ["tomato-raw", 100],
    ],
  ],
  [
    "rice",
    "Курица с рисом и брокколи",
    "Chicken with rice and broccoli",
    mains,
    [
      ["chicken-breast-baked", 160],
      ["white-rice-boiled", 200],
      ["broccoli-boiled", 120],
      ["olive-oil", 10],
    ],
  ],
  [
    "buckwheat",
    "Курица с гречкой и овощами",
    "Chicken with buckwheat and vegetables",
    mains,
    [
      ["chicken-breast-boiled", 140],
      ["buckwheat-boiled", 190],
      ["tomato-raw", 140],
      ["olive-oil", 10],
    ],
  ],
  [
    "light",
    "Курица с брокколи и огурцом",
    "Chicken with broccoli and cucumber",
    mains,
    [
      ["chicken-breast-boiled", 100],
      ["broccoli-boiled", 150],
      ["cucumber-raw", 100],
    ],
  ],
  [
    "yogurt",
    "Йогурт с яблоком",
    "Yogurt with apple",
    ["breakfast", "snack"],
    [
      ["greek-yogurt-2-fat", 170],
      ["apple-raw", 140],
    ],
  ],
] as const;

export async function mealCandidates(
  repos: Repositories,
  locale: "ru" | "en",
): Promise<MealCandidate[]> {
  const [foods, dishes, recipes] = await Promise.all([
    repos.foods.all(),
    repos.dishes.all(),
    repos.recipes.all(),
  ]);
  const byId = new Map(
    foods
      .filter(
        (food) =>
          food.basis === "mass" &&
          macroKeys.every(
            (key) => Number.isFinite(food.per100[key]) && food.per100[key] >= 0,
          ),
      )
      .map((food) => [food.id, food]),
  );
  const result: MealCandidate[] = [];
  for (const [id, ru, en, slots, ingredients] of starters) {
    const parts = ingredients.flatMap(([food, grams]) => {
      const row = byId.get(`seed-${food}`);
      return row
        ? [
            {
              kind: "food" as const,
              refId: row.id,
              grams,
              nutrients: scale(row.per100, grams),
            },
          ]
        : [];
    });
    if (parts.length === ingredients.length)
      result.push({
        id,
        name: locale === "ru" ? ru : en,
        slots: [...slots],
        parts,
      });
  }
  for (const item of [...dishes, ...recipes]) {
    const components = item.components.flatMap(({ foodId, grams }) => {
      const food = byId.get(foodId);
      return food && Number.isFinite(grams) && grams > 0
        ? [{ grams, per100: food.per100 }]
        : [];
    });
    if (!components.length || components.length !== item.components.length)
      continue;
    if ("yieldGrams" in item) {
      const math = computeRecipe(components, item.yieldGrams, item.servings);
      if (Number.isFinite(math.servingGrams) && math.servingGrams > 0)
        result.push({
          id: item.id,
          name: item.name,
          parts: [
            {
              kind: "recipe",
              refId: item.id,
              grams: math.servingGrams,
              nutrients: math.perServing,
            },
          ],
        });
    } else {
      const math = computeDish(components);
      result.push({
        id: item.id,
        name: item.name,
        parts: [
          {
            kind: "dish",
            refId: item.id,
            grams: math.totalGrams,
            nutrients: math.total,
          },
        ],
      });
    }
  }
  return result;
}

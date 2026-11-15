import type { Repositories } from "./types";
import type { MealCandidate } from "@/domain/nutrition/daily-plan";
import { macroKeys, mealFamily } from "@/domain/nutrition/daily-plan";
import { computeDish, computeRecipe } from "@/domain/nutrition/recipe";
import { scale } from "@/domain/nutrition/nutrients";
import { starterMealSteps } from "./starter-meal-steps";

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
  [
    "cottage",
    "Творог с ягодами и орехами",
    "Cottage cheese with berries and walnuts",
    ["breakfast", "snack"],
    [
      ["cottage-cheese-5-fat", 200],
      ["blueberries-raw", 120],
      ["walnuts", 20],
    ],
  ],
  [
    "avocado-toast",
    "Ржаной тост с авокадо и яйцом",
    "Rye toast with avocado and egg",
    ["breakfast"],
    [
      ["rye-bread", 70],
      ["avocado-raw", 80],
      ["egg-hard-boiled", 100],
    ],
  ],
  [
    "salmon",
    "Лосось с киноа и шпинатом",
    "Salmon with quinoa and spinach",
    mains,
    [
      ["salmon-baked", 140],
      ["quinoa-cooked", 180],
      ["spinach-raw", 90],
    ],
  ],
  [
    "lentils",
    "Чечевица с гречкой и перцем",
    "Lentils with buckwheat and peppers",
    mains,
    [
      ["lentils-boiled", 210],
      ["buckwheat-boiled", 160],
      ["bell-pepper-raw", 100],
      ["olive-oil", 10],
    ],
  ],
  [
    "shrimp",
    "Креветки с цельнозерновой пастой",
    "Shrimp with whole wheat pasta",
    mains,
    [
      ["shrimp-cooked", 150],
      ["whole-wheat-pasta-cooked", 190],
      ["tomato-raw", 120],
      ["olive-oil", 10],
    ],
  ],
  [
    "tofu",
    "Тофу с бурым рисом и капустой",
    "Tofu with brown rice and cabbage",
    mains,
    [
      ["tofu-firm", 170],
      ["brown-rice-boiled", 165],
      ["white-cabbage-raw", 120],
    ],
  ],
  [
    "tuna",
    "Салат с тунцом и нутом",
    "Tuna and chickpea salad",
    mains,
    [
      ["tuna-canned-in-water", 130],
      ["chickpeas-boiled", 130],
      ["cucumber-raw", 100],
      ["tomato-raw", 110],
    ],
  ],
  [
    "beans",
    "Фасоль с картофелем и овощами",
    "Beans with potatoes and vegetables",
    mains,
    [
      ["red-kidney-beans-boiled", 175],
      ["potato-boiled", 170],
      ["carrot-raw", 100],
      ["olive-oil", 8],
    ],
  ],
  [
    "yogurt-pear",
    "Груша с орехами и йогуртом",
    "Pear with walnuts and yogurt",
    ["snack"],
    [
      ["pear-raw", 150],
      ["walnuts", 15],
      ["greek-yogurt-2-fat", 100],
    ],
  ],
] as const;

export function ingredientKey(id: string) {
  return id.startsWith("seed-")
    ? id
        .replace(
          /-(raw|boiled|baked|cooked|hard-boiled|cooked-in-water|canned-in-water)$/,
          "",
        )
        .replace(/-hard$/, "")
        .replace(/-(?:nonfat|\d+-fat)$/, "")
    : id;
}

const mainByStarter: Record<string, string> = {
  oats: "seed-oatmeal",
  eggs: "seed-egg",
  rice: "seed-chicken-breast",
  buckwheat: "seed-chicken-breast",
  light: "seed-chicken-breast",
  yogurt: "seed-greek-yogurt",
  "yogurt-pear": "seed-greek-yogurt",
  "avocado-toast": "seed-egg",
};

export type CatalogMeal = MealCandidate & {
  ingredients: { id: string; name: string }[];
  family: string;
  detail: {
    ingredients: { foodId: string; name: string; grams: number }[];
    steps: string[];
    yieldGrams?: number;
    recipeId?: string;
  };
};

export async function mealCandidates(repos: Repositories, locale: "ru" | "en") {
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
  const result: CatalogMeal[] = [];
  const describe = (
    components: { foodId: string; grams: number }[],
    main: string,
    steps: string[] = [],
    recipe?: { id: string; yieldGrams: number },
  ) => {
    const ingredients = components.map(({ foodId, grams }) => ({
      foodId,
      grams,
      name:
        byId.get(foodId)?.nameI18n?.[locale] ??
        byId.get(foodId)?.name ??
        foodId,
    }));
    const total = ingredients.reduce((sum, item) => sum + item.grams, 0);
    const weights = new Map<string, number>();
    for (const item of ingredients) {
      const key = ingredientKey(item.foodId);
      weights.set(key, (weights.get(key) ?? 0) + item.grams / total);
    }
    return {
      family: mealFamily([...weights.keys()]),
      mainIngredient: ingredientKey(main),
      preferenceWeights: Object.fromEntries(weights),
      ingredients: ingredients.map(({ foodId, name }) => ({
        id: ingredientKey(foodId),
        name,
      })),
      detail: {
        ingredients,
        steps,
        yieldGrams: recipe?.yieldGrams,
        recipeId: recipe?.id,
      },
    };
  };
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
        ...describe(
          parts.map(({ refId, grams }) => ({ foodId: refId, grams })),
          mainByStarter[id] ?? parts[0]!.refId,
          starterMealSteps(id, locale),
        ),
      });
  }
  for (const item of [...dishes, ...recipes]) {
    const components = item.components.flatMap(({ foodId, grams }) => {
      const food = byId.get(foodId);
      return food && Number.isFinite(grams) && grams > 0
        ? [{ foodId, grams, per100: food.per100 }]
        : [];
    });
    if (!components.length || components.length !== item.components.length)
      continue;
    const main = components.reduce((best, part) =>
      part.per100.proteinG * part.grams > best.per100.proteinG * best.grams
        ? part
        : best,
    );
    if ("yieldGrams" in item) {
      const math = computeRecipe(components, item.yieldGrams, item.servings);
      if (Number.isFinite(math.servingGrams) && math.servingGrams > 0)
        result.push({
          id: item.id,
          name: item.name,
          ...describe(components, main.foodId, item.steps, {
            id: item.id,
            yieldGrams: math.yieldGrams,
          }),
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
        ...describe(components, main.foodId),
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
  return { meals: result, foods: [...byId.values()] };
}

export function recordedMealFamilies(
  candidates: CatalogMeal[],
  entries: { mealSlotId: string; refId?: string }[],
): Map<string, string> {
  const bySlot = new Map<string, string[]>();
  for (const { mealSlotId, refId } of entries) {
    if (refId)
      bySlot.set(mealSlotId, [...(bySlot.get(mealSlotId) ?? []), refId]);
  }
  const result = new Map<string, string>();
  for (const [slot, ids] of bySlot) {
    const refs = mealFamily(ids.map(ingredientKey));
    const meal = candidates.find(
      (candidate) =>
        candidate.family === refs ||
        mealFamily(candidate.parts.map(({ refId }) => ingredientKey(refId))) ===
          refs,
    );
    if (meal) result.set(slot, meal.family);
  }
  return result;
}

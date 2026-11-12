import type { DiaryEntry, MealSlot, Nutrients } from "../model";
import { add, mul, round2, sum, sumEntries } from "./nutrients";

export const macroKeys = ["kcal", "proteinG", "fatG", "carbG"] as const;
export type Macros = Pick<Nutrients, (typeof macroKeys)[number]>;

export interface MealCandidate {
  id: string;
  name: string;
  slots?: string[];
  parts: {
    kind: "food" | "dish" | "recipe";
    refId: string;
    grams: number;
    nutrients: Nutrients;
  }[];
}

function difference(target: Macros, actual: Macros): Macros {
  return {
    kcal: round2(target.kcal - actual.kcal),
    proteinG: round2(target.proteinG - actual.proteinG),
    fatG: round2(target.fatG - actual.fatG),
    carbG: round2(target.carbG - actual.carbG),
  };
}

export function dailyPlan(
  targets: Macros,
  slots: MealSlot[],
  entries: DiaryEntry[],
  candidates: MealCandidate[],
  skipped: string[],
) {
  const actual = sumEntries(entries);
  const remaining = difference(targets, actual);
  const logged = new Set(entries.map((entry) => entry.mealSlotId));
  const open = slots
    .filter((slot) => !logged.has(slot.id) && !skipped.includes(slot.id))
    .sort((a, b) => a.order - b.order);
  const lighter = remaining.kcal <= 0;
  const validTargets =
    targets.kcal > 0 &&
    macroKeys.every(
      (key) => Number.isFinite(targets[key]) && targets[key] >= 0,
    );
  const used = new Set<string>();
  let projected = actual;
  const meals = open.map((slot, index) => {
    const share =
      (slot.targetKcalShare || 1) /
      open
        .slice(index)
        .reduce((total, next) => total + (next.targetKcalShare || 1), 0);
    const budget = difference(targets, projected);
    const options = validTargets
      ? candidates
          .filter(
            (candidate) =>
              !candidate.slots ||
              candidate.slots.includes(slot.id) ||
              !["breakfast", "lunch", "dinner", "snack"].includes(slot.id),
          )
          .flatMap((candidate) =>
            (lighter ? [1] : [0.75, 1, 1.25, 1.5]).map((factor) => {
              const parts = candidate.parts.map((part) => {
                const grams = Math.max(1, Math.round(part.grams * factor));
                return {
                  ...part,
                  grams,
                  nutrients: mul(part.nutrients, grams / part.grams),
                };
              });
              const nutrients = sum(parts.map((part) => part.nutrients));
              const score = lighter
                ? nutrients.kcal
                : macroKeys.reduce(
                    (total, key) => {
                      const goal = Math.max(0, budget[key]) * share;
                      return (
                        total +
                        (Math.abs(nutrients[key] - goal) /
                          Math.max(1, targets[key])) *
                          (key === "kcal" ? 2 : 1)
                      );
                    },
                    used.has(candidate.id) ? 0.18 : 0,
                  );
              return { ...candidate, parts, nutrients, score };
            }),
          )
          .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id, "en"))
      : [];
    const selection = options[0];
    if (selection) {
      projected = add(projected, selection.nutrients);
      used.add(selection.id);
    }
    return {
      slot,
      selection,
      options: options
        .filter(
          (option, i) =>
            options.findIndex((item) => item.id === option.id) === i,
        )
        .slice(0, 3),
    };
  });
  return { actual, remaining, projected, lighter, meals, logged, validTargets };
}

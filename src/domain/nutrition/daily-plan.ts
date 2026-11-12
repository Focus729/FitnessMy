import type { DiaryEntry, MealSlot, Nutrients } from "../model";
import { add, mul, round2, sum, sumEntries, ZERO } from "./nutrients";

export const macroKeys = ["kcal", "proteinG", "fatG", "carbG"] as const;
export type Macros = Pick<Nutrients, (typeof macroKeys)[number]>;

export interface MealCandidate {
  id: string;
  name: string;
  family?: string;
  mainIngredient?: string;
  slots?: string[];
  parts: {
    kind: "food" | "dish" | "recipe";
    refId: string;
    grams: number;
    nutrients: Nutrients;
  }[];
}

export type MealSelection = MealCandidate & {
  nutrients: Nutrients;
  family: string;
  mainIngredient: string;
};

export type DailyMenu = {
  id: string;
  meals: { slot: MealSlot; selection: MealSelection | undefined }[];
  totals: Nutrients;
  projected: Nutrients;
};

const standardSlots = ["breakfast", "lunch", "dinner", "snack"];
const beamWidth = 48;

export function mealFamily(ids: string[]): string {
  return JSON.stringify([...new Set(ids)].sort());
}

type MenuPath = {
  picks: (MealSelection | undefined)[];
  totals: Nutrients;
  penalty: number;
  score: number;
};

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
  previous: ReadonlyMap<string, string> = new Map(),
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
  const fit = (value: Macros, share: number) =>
    lighter
      ? value.kcal / Math.max(1, targets.kcal)
      : macroKeys.reduce((total, key) => {
          const delta = value[key] - Math.max(0, remaining[key]) * share;
          const weight = key === "kcal" ? (delta > 0 ? 3 : 2) : 1;
          return total + (Math.abs(delta) / Math.max(1, targets[key])) * weight;
        }, 0);
  const variants: MealSelection[] = validTargets
    ? candidates
        .filter(
          ({ parts }) =>
            parts.length > 0 &&
            parts.every(
              ({ grams, nutrients }) =>
                grams > 0 &&
                Number.isFinite(grams) &&
                macroKeys.every(
                  (key) =>
                    Number.isFinite(nutrients[key]) && nutrients[key] >= 0,
                ),
            ),
        )
        .flatMap((candidate) => {
          const family =
            candidate.family ??
            mealFamily(candidate.parts.map(({ refId }) => refId));
          return (lighter ? [1] : [0.75, 1, 1.25, 1.5]).map((factor) => {
            const parts = candidate.parts.map((part) => {
              const grams = Math.max(1, Math.round(part.grams * factor));
              return {
                ...part,
                grams,
                nutrients: mul(part.nutrients, grams / part.grams),
              };
            });
            return {
              ...candidate,
              family,
              parts,
              mainIngredient: candidate.mainIngredient ?? family,
              nutrients: sum(parts.map((part) => part.nutrients)),
            };
          });
        })
    : [];
  const weight = (slot: MealSlot) =>
    slot.targetKcalShare && slot.targetKcalShare > 0 ? slot.targetKcalShare : 1;
  const totalWeight = open.reduce((total, slot) => total + weight(slot), 0);
  const families = (options: MealSelection[]) => {
    const seen = new Set<string>();
    return options.filter(
      ({ family }) => !seen.has(family) && seen.add(family),
    );
  };
  const menus: DailyMenu[] = [];
  let cumulative = 0;
  const pools = open.map((slot) => {
    const share = weight(slot) / totalWeight;
    cumulative += share;
    const eligible = variants
      .filter(
        (candidate) =>
          !candidate.slots ||
          candidate.slots.includes(slot.id) ||
          !standardSlots.includes(slot.id),
      )
      .sort(
        (a, b) =>
          fit(a.nutrients, share) - fit(b.nutrients, share) ||
          a.id.localeCompare(b.id, "en"),
      );
    const shortlist = families(eligible).slice(0, 14);
    const allowed = new Set(shortlist.map((choice) => choice.id));
    return {
      share,
      cumulative,
      shortlist,
      options: eligible.filter((choice) => allowed.has(choice.id)),
    };
  });
  const available = pools.filter(({ options }) => options.length).length;
  const requiredDifferences = Math.min(available, 2);
  const chosen: MenuPath[] = [];
  // Re-rank the beam for each alternative so close calorie fits cannot crowd out
  // different families before later meal slots have been considered.
  for (let rank = 0; rank < 3 && available; rank++) {
    let beam: MenuPath[] = [{ picks: [], totals: ZERO, penalty: 0, score: 0 }];
    pools.forEach(({ share, cumulative, options }, index) => {
      const stillAvailable = pools
        .slice(index + 1)
        .filter((pool) => pool.options.length).length;
      const choices = options.length ? options : [undefined];
      const paths = beam.flatMap((path) =>
        choices.flatMap((choice) => {
          const picks = [...path.picks, choice];
          const differences = chosen.map((other) =>
            picks.reduce(
              (n, pick, i) =>
                n + Number(pick?.family !== other.picks[i]?.family),
              0,
            ),
          );
          if (differences.some((n) => n + stillAvailable < requiredDifferences))
            return [];
          if (
            index === pools.length - 1 &&
            chosen.some(
              (other) =>
                mealFamily(
                  picks.flatMap((pick) => (pick ? [pick.family] : [])),
                ) ===
                mealFamily(
                  other.picks.flatMap((pick) => (pick ? [pick.family] : [])),
                ),
            )
          )
            return [];
          const totals = choice
            ? add(path.totals, choice.nutrients)
            : path.totals;
          const repeated =
            choice &&
            path.picks.some(
              (pick) => pick?.mainIngredient === choice.mainIngredient,
            );
          const yesterday = choice?.family === previous.get(open[index]!.id);
          const penalty =
            path.penalty +
            (lighter || !choice
              ? 0
              : 0.2 * fit(choice.nutrients, share) +
                (repeated ? 0.35 : 0) +
                (yesterday ? 0.24 : 0));
          const overlap = differences.reduce(
            (n, value) => n + Math.max(0, requiredDifferences - value),
            0,
          );
          const sameMain =
            choice &&
            chosen.some(
              (other) =>
                other.picks[index]?.mainIngredient === choice.mainIngredient,
            );
          const sameDish =
            choice &&
            chosen.some(
              (other) => other.picks[index]?.family === choice.family,
            );
          const diversityPenalty = lighter
            ? 0
            : (sameMain ? 0.26 : 0) + (sameDish ? 0.16 : 0);
          return [
            {
              picks,
              totals,
              penalty: penalty + diversityPenalty,
              score:
                fit(totals, cumulative) +
                penalty +
                diversityPenalty +
                overlap * 0.25,
            },
          ];
        }),
      );
      // Limit near-identical portion paths, leaving space for other menus.
      const signatures = new Map<string, number>();
      beam = paths
        .sort((a, b) => a.score - b.score)
        .filter(({ picks }) => {
          const key = JSON.stringify(picks.map((pick) => pick?.family));
          const count = signatures.get(key) ?? 0;
          if (count >= 2) return false;
          signatures.set(key, count + 1);
          return true;
        })
        .slice(0, beamWidth);
    });
    if (!beam[0]) break;
    chosen.push(beam[0]);
  }
  for (const path of chosen) {
    menus.push({
      id: JSON.stringify(open.map((slot, i) => [slot.id, path.picks[i]?.id])),
      meals: open.map((slot, i) => ({ slot, selection: path.picks[i] })),
      totals: path.totals,
      projected: add(actual, path.totals),
    });
  }
  const meals = open.map((slot, i) => ({
    slot,
    selection: menus[0]?.meals[i]?.selection,
    options: pools[i]?.shortlist.slice(0, 3) ?? [],
  }));
  return {
    actual,
    remaining,
    projected: menus[0]?.projected ?? actual,
    lighter,
    meals,
    menus,
    logged,
    validTargets,
  };
}

import { expect, test } from 'vitest';
import type { DiaryEntry } from '../model';
import { dailyPlan, type MealCandidate } from './daily-plan';
import { readHermesRanking } from '@/components/AdaptiveMeals';

const targets = { kcal: 2100, proteinG: 140, fatG: 70, carbG: 225 };
const slots = ['breakfast', 'lunch', 'dinner'].map((id, order) => ({ id, name: id, order }));
const candidates = [260, 650].map((kcal): MealCandidate => ({
  id: String(kcal), name: String(kcal), parts: [{
    kind: 'food', refId: String(kcal), grams: 300,
    nutrients: { kcal, proteinG: 32, fatG: 12, carbG: 48 },
  }],
}));

test('uses signed remaining macros and only replans open meals after a different breakfast', () => {
  const breakfast = {
    mealSlotId: 'breakfast',
    nutrients: { kcal: 650, proteinG: 35, fatG: 25, carbG: 70 },
  } as DiaryEntry;
  expect(dailyPlan(targets, slots, [], candidates, []).meals).toHaveLength(3);
  const plan = dailyPlan(targets, slots, [breakfast], candidates, []);
  expect(plan.remaining).toEqual({ kcal: 1450, proteinG: 105, fatG: 45, carbG: 155 });
  expect(plan.meals.map(({ slot }) => slot.id)).toEqual(['lunch', 'dinner']);
  const over = dailyPlan(targets, slots, [breakfast, {
    ...breakfast, nutrients: { ...breakfast.nutrients, kcal: 1800 },
  }], candidates, ['lunch']);
  expect(over.remaining.kcal).toBe(-350);
  expect(over.meals.map(({ selection }) => selection?.nutrients.kcal)).toEqual([260]);
  expect(over.meals[0]?.selection?.parts[0]?.grams).toBe(300);
});

test('full menus differ in dishes, not portions or swapped meal order', () => {
  const catalog = slots.flatMap((slot) => [0, 1, 2].map((i): MealCandidate => ({
    ...candidates[1]!,
    id: `${slot.id}-${i}`,
    family: `${slot.id}-${i}`,
    mainIngredient: `main-${i}`,
    slots: [slot.id],
  })));
  const full = dailyPlan(targets, slots, [], catalog, []);
  expect(full.menus).toHaveLength(3);
  for (const [i, menu] of full.menus.entries()) {
    expect(menu.meals.every(({ selection }) => selection)).toBe(true);
    for (const other of full.menus.slice(i + 1)) {
      expect(menu.meals.filter(({ selection }, index) =>
        selection?.family !== other.meals[index]?.selection?.family,
      ).length).toBeGreaterThanOrEqual(2);
    }
  }
  const smallerPortion = { ...catalog[0]!, id: 'small', parts: [{ ...catalog[0]!.parts[0]!, grams: 200 }] };
  expect(dailyPlan(targets, slots, [], [catalog[0]!, smallerPortion], []).menus).toHaveLength(1);
  const onlyDinner = dailyPlan(targets, slots, [], catalog, ['breakfast', 'lunch']);
  expect(new Set(onlyDinner.menus.map((menu) => menu.meals[0]?.selection?.family)).size).toBe(3);
  expect(readHermesRanking('{"order":[2,3,1],"explanation":"Variety"}', full.menus))
    .toEqual({ recommended: full.menus[1]?.id, explanation: 'Variety' });
  expect(readHermesRanking('{"order":[1,1,3]}', full.menus)).toBeUndefined();
  expect(readHermesRanking('{"order":[1,2,4]}', full.menus)).toBeUndefined();
  expect(readHermesRanking('[0,0,1]', full.menus)).toBeUndefined();
});

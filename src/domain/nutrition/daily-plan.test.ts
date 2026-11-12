import { expect, test } from 'vitest';
import type { DiaryEntry } from '../model';
import { dailyPlan, type MealCandidate } from './daily-plan';

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

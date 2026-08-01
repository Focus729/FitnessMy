import { describe, expect, it } from 'vitest';
import { buildShoppingList, candidateNutrients, planWeek, type PlanCandidate } from './planner';
import { buildRibbon, eatingWindow, hoursSinceLastMeal, markRadius, timeLabel } from './fasting';

const candidate = (
  refId: string,
  kcal: number,
  proteinG: number,
  patch: Partial<PlanCandidate> = {},
): PlanCandidate => ({
  refId,
  kind: 'dish',
  name: refId,
  per100: { kcal, proteinG, fatG: 5, carbG: 10 },
  baseGrams: 200,
  maxPerWeek: 7,
  ...patch,
});

const slots = [
  { mealSlotId: 'breakfast', share: 0.25 },
  { mealSlotId: 'lunch', share: 0.35 },
  { mealSlotId: 'dinner', share: 0.4 },
];

const dates = ['2026-07-06', '2026-07-07', '2026-07-08'];
const targets = { kcal: 2000, proteinG: 140, fatG: 65, carbG: 200 };

describe('планировщик меню (9.5)', () => {
  it('день сходится по калориям в пределах 5%', () => {
    const result = planWeek({
      dates,
      slots,
      candidates: [candidate('a', 150, 15), candidate('b', 120, 12), candidate('c', 200, 18)],
      targets,
    });
    for (const day of result.days) {
      expect(Math.abs(day.kcalDeviation)).toBeLessThanOrEqual(0.05);
    }
  });

  it('белок не ниже цели', () => {
    const result = planWeek({
      dates,
      slots,
      candidates: [candidate('a', 150, 20), candidate('b', 130, 18), candidate('c', 160, 22)],
      targets,
    });
    expect(result.days.every((d) => d.meetsProtein)).toBe(true);
  });

  it('детерминирован: одинаковый вход даёт одинаковый выход', () => {
    const args = {
      dates,
      slots,
      candidates: [candidate('a', 150, 15), candidate('b', 120, 12), candidate('c', 200, 18)],
      targets,
    };
    expect(JSON.stringify(planWeek(args))).toBe(JSON.stringify(planWeek(args)));
  });

  it('уважает лимит «не чаще N раз в неделю»', () => {
    const result = planWeek({
      dates,
      slots,
      candidates: [
        candidate('a', 150, 15, { maxPerWeek: 2 }),
        candidate('b', 150, 15),
        candidate('c', 150, 15),
        candidate('d', 150, 15),
      ],
      targets,
    });
    const usedA = result.days.flatMap((d) => d.slots).filter((s) => s.refId === 'a').length;
    expect(usedA).toBeLessThanOrEqual(2);
  });

  it('не ставит одно блюдо дважды в один день', () => {
    const result = planWeek({
      dates,
      slots,
      candidates: [candidate('a', 150, 15), candidate('b', 150, 15), candidate('c', 150, 15)],
      targets,
    });
    for (const day of result.days) {
      expect(new Set(day.slots.map((s) => s.refId)).size).toBe(day.slots.length);
    }
  });

  it('зафиксированные позиции остаются нетронутыми', () => {
    const pinned = {
      '2026-07-06': [
        {
          mealSlotId: 'breakfast',
          kind: 'dish' as const,
          refId: 'fixed',
          name: 'fixed',
          grams: 300,
          nutrients: { kcal: 450, proteinG: 30, fatG: 15, carbG: 40 },
          pinned: true,
        },
      ],
    };
    const result = planWeek({
      dates,
      slots,
      candidates: [candidate('a', 150, 15), candidate('b', 150, 15)],
      targets,
      pinned,
    });
    const kept = result.days[0]?.slots.find((s) => s.refId === 'fixed');
    expect(kept?.grams).toBe(300);
  });

  it('ценность кандидата масштабируется по граммам', () => {
    expect(candidateNutrients(candidate('a', 200, 20), 250).kcal).toBe(500);
  });
});

describe('список покупок', () => {
  it('суммирует одинаковые продукты и группирует по категориям', () => {
    const candidates = [
      candidate('a', 150, 15, {
        components: [
          { foodId: 'chicken', name: 'Курица', grams: 100, category: 'meat' },
          { foodId: 'rice', name: 'Рис', grams: 100, category: 'grains' },
        ],
      }),
    ];
    const plan = planWeek({ dates, slots, candidates, targets });
    const list = buildShoppingList(plan.days, candidates);

    expect(list.length).toBe(2);
    expect(list[0]?.category).toBe('meat');
    expect(list[0]?.grams).toBeGreaterThan(0);
  });

  it('блюдо без состава попадает в список целиком', () => {
    const candidates = [candidate('a', 150, 15)];
    const plan = planWeek({ dates, slots, candidates, targets });
    const list = buildShoppingList(plan.days, candidates);
    expect(list[0]?.category).toBe('other');
  });
});

describe('окно питания и лента дня (9.4, 18.4)', () => {
  it('считает окно от первой записи до последней', () => {
    const window = eatingWindow([{ time: '12:00' }, { time: '19:30' }, { time: '15:00' }], 8);
    expect(window.startMin).toBe(720);
    expect(window.endMin).toBe(1170);
    expect(window.windowMin).toBe(450);
    expect(window.withinTarget).toBe(true);
  });

  it('окно шире цели помечается', () => {
    expect(eatingWindow([{ time: '08:00' }, { time: '22:00' }], 8).withinTarget).toBe(false);
  });

  it('без записей окна нет', () => {
    expect(eatingWindow([]).startMin).toBeNull();
  });

  it('часы с последнего приёма пищи', () => {
    const now = new Date('2026-07-10T12:00:00');
    expect(hoursSinceLastMeal(new Date('2026-07-10T08:00:00'), now)).toBe(4);
    expect(hoursSinceLastMeal(null, now)).toBeNull();
  });

  it('лента собирает отметки всех типов и сортирует по времени', () => {
    const ribbon = buildRibbon({
      entries: [
        { id: 'e1', time: '13:00', nutrients: { kcal: 600, proteinG: 0, fatG: 0, carbG: 0 } },
        { id: 'e2', time: '08:00', nutrients: { kcal: 300, proteinG: 0, fatG: 0, carbG: 0 } },
      ],
      water: [{ id: 'w1', time: '10:00', ml: 250 }],
      workouts: [{ id: 'k1', startedAt: '2026-07-10T18:30:00', name: 'A' }],
    });
    expect(ribbon.marks.map((m) => m.kind)).toEqual(['meal', 'water', 'meal', 'workout']);
    expect(ribbon.maxKcal).toBe(600);
  });

  it('радиус круга растёт с калорийностью', () => {
    expect(markRadius(600, 600)).toBeGreaterThan(markRadius(100, 600));
    expect(markRadius(undefined, 0)).toBe(3);
  });

  it('минуты переводятся в HH:mm', () => {
    expect(timeLabel(0)).toBe('00:00');
    expect(timeLabel(755)).toBe('12:35');
  });
});

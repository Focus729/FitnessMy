import { describe, expect, it } from 'vitest';
import {
  groupByDate,
  itemsFromRoutineDay,
  nextPlannedDates,
  overduePlans,
  reschedule,
  upcomingPlan,
} from './planning';
import type { PlannedWorkout, Routine, RoutineDay } from '@/domain/model';

const day = (id: string, name: string, order: number): RoutineDay => ({
  id,
  name,
  order,
  items: [
    {
      id: `${id}-i1`,
      exerciseId: 'squat',
      order: 1,
      targetSets: 3,
      targetRepsMin: 5,
      targetRepsMax: 8,
      restSec: 180,
    },
    {
      id: `${id}-i2`,
      exerciseId: 'bench',
      order: 0,
      targetSets: 3,
      targetRepsMin: 6,
      targetRepsMax: 10,
      restSec: 150,
    },
  ],
});

const routine: Routine = {
  id: 'r1',
  name: 'Верх/низ',
  source: 'user',
  days: [day('d1', 'День A', 0), day('d2', 'День B', 1)],
  nextDayIndex: 0,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const plan = (id: string, date: string, patch: Partial<PlannedWorkout> = {}): PlannedWorkout => ({
  id,
  plannedDate: date,
  name: id,
  items: [],
  status: 'planned',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...patch,
});

describe('следующие даты по программе', () => {
  it('ставит тренировки через день и чередует дни цикла', () => {
    const dates = nextPlannedDates(routine, '2026-08-03', 4);
    expect(dates.map((d) => d.date)).toEqual([
      '2026-08-03',
      '2026-08-05',
      '2026-08-07',
      '2026-08-09',
    ]);
    expect(dates.map((d) => d.routineDayId)).toEqual(['d1', 'd2', 'd1', 'd2']);
  });

  it('уважает выбранные дни недели', () => {
    // 2026-08-03 — понедельник
    const dates = nextPlannedDates(routine, '2026-08-03', 3, { weekdays: [1, 3, 5] });
    expect(dates.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-05', '2026-08-07']);
  });

  it('пропускает занятые даты', () => {
    const dates = nextPlannedDates(routine, '2026-08-03', 2, {
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      busyDates: ['2026-08-04'],
    });
    expect(dates.map((d) => d.date)).toEqual(['2026-08-03', '2026-08-05']);
  });

  it('начинает с указанного дня цикла', () => {
    const dates = nextPlannedDates(routine, '2026-08-03', 2, { startDayIndex: 1 });
    expect(dates.map((d) => d.routineDayId)).toEqual(['d2', 'd1']);
  });

  it('программа без дней дат не даёт', () => {
    expect(nextPlannedDates({ ...routine, days: [] }, '2026-08-03', 3)).toEqual([]);
    expect(nextPlannedDates(routine, '2026-08-03', 0)).toEqual([]);
  });

  it('состав дня переносится в план с нормализованным порядком', () => {
    const items = itemsFromRoutineDay(day('d1', 'A', 0));
    expect(items.map((i) => i.exerciseId)).toEqual(['bench', 'squat']);
    expect(items.map((i) => i.order)).toEqual([0, 1]);
    expect(items[0]?.targetSets).toBe(3);
  });
});

describe('перенос плана', () => {
  const plans = [
    plan('a', '2026-08-03'),
    plan('b', '2026-08-05'),
    plan('c', '2026-08-07'),
  ];

  it('переносит только выбранный план', () => {
    const next = reschedule(plans, 'a', '2026-08-04', false);
    expect(next.map((p) => p.plannedDate)).toEqual(['2026-08-04', '2026-08-05', '2026-08-07']);
  });

  it('со сдвигом двигает последующие на то же число дней', () => {
    const next = reschedule(plans, 'a', '2026-08-05', true);
    expect(next.map((p) => p.plannedDate)).toEqual(['2026-08-05', '2026-08-07', '2026-08-09']);
  });

  it('не двигает уже начатые планы', () => {
    const withStarted = [plans[0] as PlannedWorkout, plan('b', '2026-08-05', { status: 'started' })];
    const next = reschedule(withStarted, 'a', '2026-08-05', true);
    expect(next[1]?.plannedDate).toBe('2026-08-05');
  });

  it('перенос на ту же дату ничего не меняет', () => {
    expect(reschedule(plans, 'a', '2026-08-03', true)).toBe(plans);
  });

  it('неизвестный план игнорируется', () => {
    expect(reschedule(plans, 'нет такого', '2026-08-09', true)).toBe(plans);
  });

  it('исходный массив не мутируется', () => {
    reschedule(plans, 'a', '2026-08-10', true);
    expect(plans[0]?.plannedDate).toBe('2026-08-03');
  });
});

describe('просроченные и ближайшие планы', () => {
  const plans = [
    plan('past', '2026-08-01'),
    plan('done', '2026-08-02', { status: 'completed' }),
    plan('today', '2026-08-05'),
    plan('future', '2026-08-09'),
  ];

  it('просроченные — только не начатые с прошедшей датой', () => {
    expect(overduePlans(plans, '2026-08-05').map((p) => p.id)).toEqual(['past']);
  });

  it('ближайший план включает сегодняшний', () => {
    expect(upcomingPlan(plans, '2026-08-05')?.id).toBe('today');
    expect(upcomingPlan(plans, '2026-08-06')?.id).toBe('future');
    expect(upcomingPlan(plans, '2026-09-01')).toBeUndefined();
  });

  it('удалённые планы не попадают никуда', () => {
    const deleted = [plan('x', '2026-08-05', { deletedAt: '2026-08-04T00:00:00.000Z' })];
    expect(upcomingPlan(deleted, '2026-08-01')).toBeUndefined();
    expect(overduePlans(deleted, '2026-08-09')).toEqual([]);
    expect(groupByDate(deleted).size).toBe(0);
  });

  it('группировка по датам для календаря', () => {
    const grouped = groupByDate([plan('a', '2026-08-05'), plan('b', '2026-08-05')]);
    expect(grouped.get('2026-08-05')).toHaveLength(2);
  });
});

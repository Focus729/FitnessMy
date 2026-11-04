import { expect, it, vi } from 'vitest';
import type { Repositories } from '@/data/repositories/types';
import type { GameState } from '@/domain/model';
import { addDays } from '@/lib/date';
import { recomputeStreaks } from './streaks';

function fixture(
  diary: { date: string }[],
  workouts: { date: string; finishedAt: string }[] = [],
) {
  const update = vi.fn();
  const state: GameState = {
    id: 'singleton',
    xp: 0,
    level: 1,
    freezes: 0,
    unlockedAchievements: [],
    updatedAt: '',
    streaks: {
      records: { current: 2, best: 10, lastDate: '2020-01-01' },
      food: { current: 0, best: 900, lastDate: '' },
    },
  };
  const repos = {
    settings: { get: async () => ({ firstDayOfWeek: 1 }) },
    habits: { all: async () => [] },
    habitLogs: { all: async () => [] },
    diary: { all: async () => diary },
    workouts: { all: async () => workouts },
    game: { get: async () => state, update },
  } as unknown as Repositories;
  return { repos, update };
}

it('counts beyond 400 days, preserves historical bests and unknown progress keys', async () => {
  const dates = Array.from({ length: 450 }, (_, i) => ({
    date: addDays('2024-01-01', i),
  }));
  const { repos, update } = fixture(dates);
  await recomputeStreaks(repos, dates.at(-1)!.date);
  expect(update.mock.calls[0]![0].streaks.food).toMatchObject({
    current: 450,
    best: 900,
  });
  expect(update.mock.calls[0]![0].streaks.records.best).toBe(10);
});

it('groups a year-boundary ISO week once and excludes future workouts', async () => {
  const { repos, update } = fixture(
    [],
    [
      { date: '2020-12-31', finishedAt: 'yes' },
      { date: '2021-01-01', finishedAt: 'yes' },
      { date: '2021-02-01', finishedAt: 'yes' },
    ],
  );
  await recomputeStreaks(repos, '2021-01-03');
  expect(update.mock.calls[0]![0].streaks.workoutWeeks).toEqual({
    current: 1,
    best: 1,
    lastDate: '2020-12-28',
  });
});

it('uses the explicit evaluation date without reading the device clock', async () => {
  const { repos, update } = fixture([
    { date: '2024-01-01' },
    { date: '2024-01-02' },
  ]);
  await recomputeStreaks(repos, '2024-01-01');
  expect(update.mock.calls[0]![0].streaks.food.current).toBe(1);
});

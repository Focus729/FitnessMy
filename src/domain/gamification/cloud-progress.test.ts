import { expect, it } from 'vitest';
import type { GameState, XpEvent } from '../model';
import {
  createProgressBaseline,
  reconcileCloudProgress,
} from './cloud-progress';
const stamp = '2026-11-05T10:00:00.000Z';
const event = (id: string, amount: number): XpEvent => ({
  id,
  dedupeKey: id,
  reason: 'fixture',
  amount,
  date: '2026-11-05',
  createdAt: stamp,
  updatedAt: stamp,
});
const state: GameState = {
  id: 'singleton',
  xp: 130,
  level: 1,
  freezes: 3,
  streaks: { habits: { current: 20, best: 50, lastDate: '2026-11-04' } },
  unlockedAchievements: [{ key: 'earned', unlockedAt: stamp }],
  updatedAt: stamp,
};
const derived = {
  freezes: 1,
  streaks: { habits: { current: 2, best: 2, lastDate: '2026-11-05' } },
};
it('preserves legacy XP once and adds distinct future awards from both devices', () => {
  const baseline = createProgressBaseline('phone-profile', state, [
    event('old', 30),
  ]);
  expect(baseline.legacyXp).toBe(100);
  const progress = reconcileCloudProgress({
    baselines: [baseline, structuredClone(baseline)],
    events: [
      event('old', 30),
      event('phone-new', 20),
      event('pc-new', 40),
      event('old', 30),
    ],
    snapshots: [state, { ...state, xp: 150 }],
    derived,
    updatedAt: stamp,
  });
  expect(progress.xp).toBe(190);
  expect(progress.freezes).toBe(1);
  expect(progress.streaks.habits).toEqual({
    current: 2,
    best: 50,
    lastDate: '2026-11-05',
  });
  expect(progress.unlockedAchievements).toHaveLength(1);
});
it('requires review when the same migration source is assigned a different legacy amount', () => {
  const baseline = createProgressBaseline('phone-profile', state, []);
  expect(() =>
    reconcileCloudProgress({
      baselines: [baseline, { ...baseline, legacyXp: 999 }],
      events: [],
      snapshots: [],
      derived,
      updatedAt: stamp,
    }),
  ).toThrow('progress_baseline_conflict');
});
it('retains unknown historical streak keys and does not mutate source snapshots', () => {
  const snapshot = {
    ...state,
    streaks: { records: { current: 5, best: 8, lastDate: '2020-01-01' } },
  };
  const before = JSON.stringify(snapshot);
  const progress = reconcileCloudProgress({
    baselines: [],
    events: [],
    snapshots: [snapshot],
    derived,
    updatedAt: stamp,
  });
  expect(progress.streaks.records).toEqual(snapshot.streaks.records);
  expect(JSON.stringify(snapshot)).toBe(before);
});

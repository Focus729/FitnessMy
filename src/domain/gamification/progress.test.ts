import { describe, expect, it } from 'vitest';
import { mergeAchievements } from './progress';

describe('achievement reconciliation', () => {
  it('keeps the first unlock date regardless of snapshot order and repeated delivery', () => {
    const early = [
      { key: 'firstEntry', unlockedAt: '2026-10-01T00:00:00.000Z' },
    ];
    const later = [
      { key: 'firstEntry', unlockedAt: '2026-11-01T00:00:00.000Z' },
      { key: 'firstWorkout', unlockedAt: '2026-11-01T00:00:00.000Z' },
    ];
    const merged = mergeAchievements(early, later);
    expect(merged).toEqual([early[0], later[1]]);
    expect(mergeAchievements(later, early)).toEqual(merged);
    expect(mergeAchievements(merged, early, later)).toEqual(merged);
  });
  it('does not mutate input snapshots or share returned records with them', () => {
    const snapshot = [
      { key: 'firstEntry', unlockedAt: '2026-10-01T00:00:00.000Z' },
    ];
    const result = mergeAchievements(snapshot);
    result[0]!.key = 'changed';
    expect(snapshot[0]!.key).toBe('firstEntry');
  });
  it('accepts an empty history', () => {
    expect(mergeAchievements([], [])).toEqual([]);
  });
});

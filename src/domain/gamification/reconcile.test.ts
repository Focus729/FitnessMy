import { expect, it } from 'vitest';
import type { XpEvent } from '../model';
import { legacyXpGap, reconcileXpEvents } from './reconcile';

const event = (id: string, dedupeKey = 'workout:w1', amount = 30): XpEvent => ({
  id,
  dedupeKey,
  amount,
  reason: 'workoutFinished',
  date: '2026-11-04',
  createdAt: '2026-11-04T10:00:00.000Z',
  updatedAt: '2026-11-04T10:00:00.000Z',
});
it('deduplicates the same award from two devices independent of input order', () => {
  const a = [event('b')];
  const b = [event('a'), event('c', 'workout:w2')];
  const result = reconcileXpEvents(a, b);
  expect(result).toEqual(reconcileXpEvents(b, a));
  expect(result.xp).toBe(60);
  expect(result.events.map((item) => item.id)).toEqual(['a', 'c']);
  expect(reconcileXpEvents(result.events, a, b)).toEqual(result);
});
it('retains XP after deletion and reports missing legacy awards separately', () => {
  const deleted = { ...event('a'), deletedAt: '2026-11-04T11:00:00.000Z' };
  expect(reconcileXpEvents([deleted]).xp).toBe(30);
  expect(legacyXpGap(100, [deleted])).toBe(70);
  expect(legacyXpGap(10, [deleted])).toBe(0);
});
it('does not silently select between contradictory awards or reused IDs', () => {
  expect(() =>
    reconcileXpEvents([event('a')], [event('b', 'workout:w1', 40)]),
  ).toThrow('progress_event_conflict');
  expect(() =>
    reconcileXpEvents([event('a')], [event('a', 'workout:w2')]),
  ).toThrow('progress_event_conflict');
});
it('rejects invalid or overflowing totals and returns independent event objects', () => {
  expect(() => reconcileXpEvents([event('a', 'x', -1)])).toThrow(
    'invalid_progress_event',
  );
  expect(() =>
    reconcileXpEvents([
      event('a', 'x', Number.MAX_SAFE_INTEGER),
      event('b', 'y'),
    ]),
  ).toThrow('progress_total_overflow');
  const source = event('a');
  const result = reconcileXpEvents([source]);
  result.events[0]!.amount = 0;
  expect(source.amount).toBe(30);
});

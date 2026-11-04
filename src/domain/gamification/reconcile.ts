import type { XpEvent } from '../model';
import { levelForXp } from './xp';

export class ProgressConflict extends Error {
  constructor(public readonly dedupeKey: string) {
    super('progress_event_conflict');
  }
}

/** Merge validated event histories, never device XP counters. Deletion does not revoke earned XP. */
export function reconcileXpEvents(...histories: readonly XpEvent[][]): {
  events: XpEvent[];
  xp: number;
  level: number;
} {
  const byAward = new Map<string, XpEvent>();
  const ids = new Map<string, string>();
  for (const history of histories)
    for (const event of history) {
      if (
        !Number.isSafeInteger(event.amount) ||
        event.amount < 0 ||
        !event.dedupeKey ||
        !Number.isFinite(Date.parse(event.createdAt))
      ) {
        throw new Error('invalid_progress_event');
      }
      const previousKey = ids.get(event.id);
      if (previousKey !== undefined && previousKey !== event.dedupeKey)
        throw new ProgressConflict(event.dedupeKey);
      ids.set(event.id, event.dedupeKey);
      const previous = byAward.get(event.dedupeKey);
      if (
        previous &&
        (previous.amount !== event.amount ||
          previous.date !== event.date ||
          previous.reason !== event.reason)
      ) {
        throw new ProgressConflict(event.dedupeKey);
      }
      // Stable identity selection does not depend on which device is processed first.
      if (
        !previous ||
        event.createdAt < previous.createdAt ||
        (event.createdAt === previous.createdAt && event.id < previous.id) ||
        (event.createdAt === previous.createdAt && event.id === previous.id &&
          JSON.stringify([event.updatedAt, event.deletedAt ?? '']) >
          JSON.stringify([previous.updatedAt, previous.deletedAt ?? '']))
      ) {
        byAward.set(event.dedupeKey, { ...event });
      }
    }
  const events = [...byAward.values()].sort((a, b) =>
    a.dedupeKey < b.dedupeKey ? -1 : a.dedupeKey > b.dedupeKey ? 1 : 0,
  );
  const xp = events.reduce((sum, event) => sum + event.amount, 0);
  if (!Number.isSafeInteger(xp)) throw new Error('progress_total_overflow');
  return { events, xp, level: levelForXp(xp) };
}

/** A missing legacy event ledger needs explicit migration review, not an invented award. */
export function legacyXpGap(storedXp: number, events: XpEvent[]): number {
  if (!Number.isSafeInteger(storedXp) || storedXp < 0)
    throw new Error('invalid_progress_total');
  return Math.max(0, storedXp - reconcileXpEvents(events).xp);
}

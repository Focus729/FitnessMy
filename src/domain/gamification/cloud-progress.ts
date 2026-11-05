import type { GameState, StreakState, XpEvent } from '../model';
import { mergeAchievements, type UnlockedAchievement } from './progress';
import { legacyXpGap, reconcileXpEvents } from './reconcile';
import { levelForXp } from './xp';

export interface ProgressBaseline {
  sourceProfileId: string;
  legacyXp: number;
  achievements: UnlockedAchievement[];
  streaks: Record<string, StreakState>;
}

/** Capture once at approved migration; never derive a fresh gap from subsequent device totals. */
export function createProgressBaseline(
  sourceProfileId: string,
  state: GameState,
  events: XpEvent[],
): ProgressBaseline {
  if (!sourceProfileId) throw new Error('invalid_progress_source');
  return {
    sourceProfileId,
    legacyXp: legacyXpGap(state.xp, events),
    achievements: structuredClone(state.unlockedAchievements),
    streaks: structuredClone(state.streaks),
  };
}

/** Legacy XP is counted once per source; current balances come from the merged event/history data. */
export function reconcileCloudProgress(input: {
  baselines: ProgressBaseline[];
  events: XpEvent[];
  snapshots: GameState[];
  derived: { freezes: number; streaks: Record<string, StreakState> };
  updatedAt: string;
}): GameState {
  const sources = new Map<string, number>();
  for (const baseline of input.baselines) {
    if (
      !baseline.sourceProfileId ||
      !Number.isSafeInteger(baseline.legacyXp) ||
      baseline.legacyXp < 0
    )
      throw new Error('invalid_progress_baseline');
    const previous = sources.get(baseline.sourceProfileId);
    if (previous !== undefined && previous !== baseline.legacyXp)
      throw new Error('progress_baseline_conflict');
    sources.set(baseline.sourceProfileId, baseline.legacyXp);
  }
  const xp =
    reconcileXpEvents(input.events).xp +
    [...sources.values()].reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(xp)) throw new Error('progress_total_overflow');
  if (
    !Number.isInteger(input.derived.freezes) ||
    input.derived.freezes < 0 ||
    input.derived.freezes > 3 ||
    !Number.isFinite(Date.parse(input.updatedAt))
  )
    throw new Error('invalid_derived_progress');
  const streaks: Record<string, StreakState> = Object.create(null) as Record<
    string,
    StreakState
  >;
  for (const snapshot of [
    ...input.baselines.map((item) => item.streaks),
    ...input.snapshots.map((item) => item.streaks),
    input.derived.streaks,
  ]) {
    for (const [key, value] of Object.entries(snapshot)) {
      if (
        Object.keys(value).some(
          (field) => !['current', 'best', 'lastDate'].includes(field),
        ) ||
        !Number.isSafeInteger(value.current) ||
        value.current < 0 ||
        !Number.isSafeInteger(value.best) ||
        value.best < 0 ||
        typeof value.lastDate !== 'string'
      )
        throw new Error('invalid_progress_streak');
      const previous = streaks[key];
      // Known derived series replace current values; historical bests remain monotonic.
      const preferred =
        snapshot === input.derived.streaks ||
        !previous ||
        value.lastDate > previous.lastDate ||
        (value.lastDate === previous.lastDate &&
          value.current > previous.current)
          ? value
          : previous;
      streaks[key] = {
        ...preferred,
        best: Math.max(previous?.best ?? 0, value.best, value.current),
      };
    }
  }
  const achievements = [
    ...input.baselines.map((item) => item.achievements),
    ...input.snapshots.map((item) => item.unlockedAchievements),
  ];
  if (
    achievements.some((items) =>
      items.some(
        (item) =>
          Object.keys(item).some(
            (field) => !['key', 'unlockedAt'].includes(field),
          ) ||
          !item.key ||
          !Number.isFinite(Date.parse(item.unlockedAt)),
      ),
    )
  )
    throw new Error('invalid_progress_achievement');
  return {
    id: 'singleton',
    xp,
    level: levelForXp(xp),
    freezes: input.derived.freezes,
    streaks,
    unlockedAchievements: mergeAchievements(...achievements),
    updatedAt: input.updatedAt,
  };
}

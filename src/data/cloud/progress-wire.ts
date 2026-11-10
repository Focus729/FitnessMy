import type { GameState, StreakState } from '../../domain/model';
import type { UnlockedAchievement } from '../../domain/gamification/progress';
import {
  reconcileCloudProgress,
  type ProgressBaseline,
} from '../../domain/gamification/cloud-progress';
import { validateCloudEntity } from './schema';

export interface ProgressMetadata {
  key: 'progress';
  baselines: ProgressBaseline[];
  unlockedAchievements?: UnlockedAchievement[];
  streaks?: Record<string, StreakState>;
}

export interface ProgressEnvelope extends Record<string, unknown> {
  id: 'singleton';
  updatedAt: string;
  baselines: ProgressBaseline[];
  unlockedAchievements: UnlockedAchievement[];
  streaks: Record<string, StreakState>;
}

/** Transfer evidence and the reviewed legacy gap, never a device's computed balances. */
export function progressEnvelope(
  state: GameState,
  metadata: ProgressMetadata,
): ProgressEnvelope {
  const merged = mergeProgressMetadata(metadata, {
    id: 'singleton',
    updatedAt: state.updatedAt,
    baselines: metadata.baselines,
    unlockedAchievements: state.unlockedAchievements,
    streaks: state.streaks,
  });
  const envelope: ProgressEnvelope = {
    id: 'singleton',
    updatedAt: state.updatedAt,
    baselines: merged.baselines,
    unlockedAchievements: merged.unlockedAchievements!,
    streaks: merged.streaks!,
  };
  validateCloudEntity('gameState', envelope);
  return envelope;
}

/** Conflicting legacy amounts fail before replacing any local evidence. */
export function mergeProgressMetadata(
  local: ProgressMetadata | undefined,
  incoming: ProgressEnvelope,
): ProgressMetadata {
  validateCloudEntity('gameState', incoming);
  const baselines = [...(local?.baselines ?? []), ...incoming.baselines];
  const snapshots = [local, incoming]
    .filter((value) => value !== undefined)
    .map((value) => ({
      id: 'singleton' as const,
      xp: 0,
      level: 1,
      freezes: 0,
      updatedAt: incoming.updatedAt,
      streaks: value.streaks ?? {},
      unlockedAchievements: value.unlockedAchievements ?? [],
    }));
  const merged = reconcileCloudProgress({
    baselines,
    events: [],
    snapshots,
    derived: { freezes: 0, streaks: {} },
    updatedAt: incoming.updatedAt,
  });
  // Combined achievements and streaks above retain evidence from both copies.
  const sources = new Map<string, ProgressBaseline>();
  for (const baseline of baselines)
    if (!sources.has(baseline.sourceProfileId))
      sources.set(baseline.sourceProfileId, baseline);
  return {
    key: 'progress',
    baselines: [...sources.values()].sort((a, b) =>
      a.sourceProfileId.localeCompare(b.sourceProfileId),
    ),
    unlockedAchievements: merged.unlockedAchievements,
    streaks: merged.streaks,
  };
}

export async function storeProgressEnvelope(
  db: import('../db/schema').LentaDB,
  payload: Record<string, unknown>,
): Promise<void> {
  const table = db.table<ProgressMetadata, string>('cloudState');
  const existing = await table.get('progress');
  await table.put(mergeProgressMetadata(existing, payload as ProgressEnvelope));
}

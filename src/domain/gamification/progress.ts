export interface UnlockedAchievement {
  key: string;
  unlockedAt: string;
}

/** Awards are monotonic: merging stale snapshots must never remove an earned achievement. */
export function mergeAchievements(
  ...snapshots: readonly UnlockedAchievement[][]
): UnlockedAchievement[] {
  const byKey = new Map<string, UnlockedAchievement>();
  for (const snapshot of snapshots)
    for (const achievement of snapshot) {
      const current = byKey.get(achievement.key);
      if (
        !current ||
        Date.parse(achievement.unlockedAt) < Date.parse(current.unlockedAt)
      )
        byKey.set(achievement.key, { ...achievement });
    }
  return [...byKey.values()].sort(
    (a, b) =>
      a.unlockedAt.localeCompare(b.unlockedAt) || a.key.localeCompare(b.key),
  );
}

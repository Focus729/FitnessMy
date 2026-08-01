/**
 * Достижения — раздел 12.3. Ключи локализации, 28 штук.
 *
 * Все условия — только на ДЕЙСТВИЯ. Ни одно достижение не завязано на вес
 * или дефицит калорий: приложение награждает за регулярность, а не за похудение.
 */

export type AchievementCategory = 'firstSteps' | 'consistency' | 'volume' | 'records' | 'explore';

export interface AchievementDef {
  key: string;
  category: AchievementCategory;
  /** Значение счётчика, при котором достижение открывается. */
  threshold: number;
  /** Какой счётчик проверять. */
  metric: AchievementMetric;
}

export type AchievementMetric =
  | 'diaryEntries'
  | 'loggedDays'
  | 'workouts'
  | 'totalVolumeKg'
  | 'habitStreak'
  | 'foodStreak'
  | 'workoutStreak'
  | 'distinctFoods30d'
  | 'customFoods'
  | 'personalRecords'
  | 'weighIns'
  | 'checkins'
  | 'recipes'
  | 'cardioSessions';

export interface AchievementProgress {
  metric: AchievementMetric;
  value: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Первые шаги
  { key: 'firstEntry', category: 'firstSteps', metric: 'diaryEntries', threshold: 1 },
  { key: 'firstWorkout', category: 'firstSteps', metric: 'workouts', threshold: 1 },
  { key: 'firstWeighIn', category: 'firstSteps', metric: 'weighIns', threshold: 1 },
  { key: 'firstCheckin', category: 'firstSteps', metric: 'checkins', threshold: 1 },
  { key: 'firstRecipe', category: 'firstSteps', metric: 'recipes', threshold: 1 },
  { key: 'firstCardio', category: 'firstSteps', metric: 'cardioSessions', threshold: 1 },

  // Постоянство
  { key: 'streak7', category: 'consistency', metric: 'habitStreak', threshold: 7 },
  { key: 'streak30', category: 'consistency', metric: 'habitStreak', threshold: 30 },
  { key: 'streak100', category: 'consistency', metric: 'habitStreak', threshold: 100 },
  { key: 'foodStreak7', category: 'consistency', metric: 'foodStreak', threshold: 7 },
  { key: 'foodStreak30', category: 'consistency', metric: 'foodStreak', threshold: 30 },
  { key: 'foodStreak100', category: 'consistency', metric: 'foodStreak', threshold: 100 },
  { key: 'workoutStreak4', category: 'consistency', metric: 'workoutStreak', threshold: 4 },
  { key: 'workoutStreak12', category: 'consistency', metric: 'workoutStreak', threshold: 12 },
  { key: 'loggedDays30', category: 'consistency', metric: 'loggedDays', threshold: 30 },
  { key: 'loggedDays180', category: 'consistency', metric: 'loggedDays', threshold: 180 },
  { key: 'loggedDays365', category: 'consistency', metric: 'loggedDays', threshold: 365 },

  // Объём
  { key: 'workouts25', category: 'volume', metric: 'workouts', threshold: 25 },
  { key: 'workouts100', category: 'volume', metric: 'workouts', threshold: 100 },
  { key: 'workouts500', category: 'volume', metric: 'workouts', threshold: 500 },
  { key: 'volume100k', category: 'volume', metric: 'totalVolumeKg', threshold: 100_000 },
  { key: 'volume1m', category: 'volume', metric: 'totalVolumeKg', threshold: 1_000_000 },
  { key: 'entries1000', category: 'volume', metric: 'diaryEntries', threshold: 1000 },

  // Рекорды
  { key: 'records10', category: 'records', metric: 'personalRecords', threshold: 10 },
  { key: 'records50', category: 'records', metric: 'personalRecords', threshold: 50 },

  // Исследование
  { key: 'variety50', category: 'explore', metric: 'distinctFoods30d', threshold: 50 },
  { key: 'ownFoods25', category: 'explore', metric: 'customFoods', threshold: 25 },
  { key: 'ownFoods100', category: 'explore', metric: 'customFoods', threshold: 100 },
];

export interface AchievementStatus {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
  /** 0..1 — для тихого прогресса без иллюстраций. */
  progress: number;
}

export function evaluateAchievements(
  metrics: Partial<Record<AchievementMetric, number>>,
  unlockedKeys: Set<string> = new Set(),
): AchievementStatus[] {
  return ACHIEVEMENTS.map((def) => {
    const value = metrics[def.metric] ?? 0;
    const unlocked = unlockedKeys.has(def.key) || value >= def.threshold;
    return {
      def,
      value,
      unlocked,
      progress: def.threshold > 0 ? Math.min(1, value / def.threshold) : 0,
    };
  });
}

/** Какие достижения открылись именно сейчас — для записи в GameState. */
export function newlyUnlocked(
  metrics: Partial<Record<AchievementMetric, number>>,
  alreadyUnlocked: Set<string>,
): string[] {
  return ACHIEVEMENTS.filter(
    (def) => !alreadyUnlocked.has(def.key) && (metrics[def.metric] ?? 0) >= def.threshold,
  ).map((d) => d.key);
}

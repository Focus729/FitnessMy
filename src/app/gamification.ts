/**
 * Начисление опыта и открытие достижений — раздел 12.3.
 *
 * Вызывается из экранов после действий пользователя. Все правила (дедупликация,
 * запрет начисления задним числом дальше 48 часов) живут в domain/gamification.
 */
import type { Repositories } from '@/data/repositories/types';
import type { LocalDate } from '@/domain/model';
import { dedupeKey, isXpEligible, xpFor, type XpReason } from '@/domain/gamification/xp';
import { newlyUnlocked, type AchievementMetric } from '@/domain/gamification/achievements';
import { nowIso } from '@/lib/date';

export async function award(
  repos: Repositories,
  reason: XpReason,
  date: LocalDate,
  ref?: string,
): Promise<void> {
  const settings = await repos.settings.get();
  if (!settings.gamificationEnabled) return;
  if (!isXpEligible(date)) return;

  await repos.game.awardXp({
    reason,
    amount: xpFor(reason),
    date,
    dedupeKey: dedupeKey(reason, date, ref),
  });
}

/** Пересчёт метрик достижений. Считается по требованию, не на каждое действие. */
export async function refreshAchievements(repos: Repositories): Promise<string[]> {
  const settings = await repos.settings.get();
  if (!settings.gamificationEnabled) return [];

  const state = await repos.game.get();
  const [diary, workouts, foods, body, checkins, recipes, cardio] = await Promise.all([
    repos.diary.all(),
    repos.workouts.all(),
    repos.foods.all(),
    repos.body.all(),
    repos.checkins.all(),
    repos.recipes.all(),
    repos.cardio.all(),
  ]);

  const finished = workouts.filter((w) => w.finishedAt);
  const metrics: Partial<Record<AchievementMetric, number>> = {
    diaryEntries: diary.length,
    loggedDays: new Set(diary.map((e) => e.date)).size,
    workouts: finished.length,
    totalVolumeKg: finished.reduce((s, w) => s + w.totalVolumeKg, 0),
    habitStreak: state.streaks.habits?.best ?? 0,
    foodStreak: state.streaks.food?.best ?? 0,
    workoutStreak: state.streaks.workoutWeeks?.best ?? 0,
    distinctFoods30d: countDistinctRecent(diary),
    customFoods: foods.filter((f) => f.source === 'user').length,
    personalRecords: state.streaks.records?.best ?? 0,
    weighIns: body.filter((b) => b.weightKg != null).length,
    checkins: checkins.length,
    recipes: recipes.length,
    cardioSessions: cardio.length,
  };

  const already = new Set(state.unlockedAchievements.map((a) => a.key));
  const fresh = newlyUnlocked(metrics, already);
  if (fresh.length === 0) return [];

  await repos.game.update({
    unlockedAchievements: [
      ...state.unlockedAchievements,
      ...fresh.map((key) => ({ key, unlockedAt: nowIso() })),
    ],
  });
  return fresh;
}

function countDistinctRecent(diary: { date: LocalDate; refId?: string; quickName?: string }[]): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const from = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  return new Set(
    diary.filter((e) => e.date >= from).map((e) => e.refId ?? e.quickName ?? ''),
  ).size;
}

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
import { quitStats } from '@/domain/habits/quit';
import { nowIso, today } from '@/lib/date';

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

/**
 * Вехи отказа от привычки (задача 3): 1, 3, 7… дней воздержания.
 * Отмечаются в ленте достижений, только если геймификация включена.
 * Ключ вида `quit:<habitId>:<веха>` — веха засчитывается один раз.
 */
export async function refreshQuitMilestones(repos: Repositories): Promise<string[]> {
  const settings = await repos.settings.get();
  if (!settings.gamificationEnabled) return [];

  const [habits, state] = await Promise.all([repos.habits.all(), repos.game.get()]);
  const quitHabits = habits.filter((h) => h.polarity === 'quit' && !h.archived);
  if (quitHabits.length === 0) return [];

  const unlocked = new Set(state.unlockedAchievements.map((a) => a.key));
  const fresh: string[] = [];
  const now = today();

  for (const habit of quitHabits) {
    const logs = await repos.habitLogs.byHabit(habit.id);
    const stats = quitStats(logs, habit.quitStartDate ?? habit.createdAt.slice(0, 10), now);
    for (const milestone of stats.reachedMilestones) {
      const key = `quit:${habit.id}:${milestone}`;
      if (!unlocked.has(key)) fresh.push(key);
    }
  }

  if (fresh.length === 0) return [];
  await repos.game.update({
    unlockedAchievements: [
      ...state.unlockedAchievements,
      ...fresh.map((key) => ({ key, unlockedAt: nowIso() })),
    ],
  });
  return fresh;
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

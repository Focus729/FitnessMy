import { describe, expect, it } from 'vitest';
import { dedupeKey, isXpEligible, levelForXp, levelProgress, levelThreshold, xpFor, XP_TABLE } from './xp';
import { ACHIEVEMENTS, evaluateAchievements, newlyUnlocked } from './achievements';

describe('уровни', () => {
  it('порог уровня N = 100·N^1.5, округление до 10', () => {
    expect(levelThreshold(1)).toBe(0);
    expect(levelThreshold(2)).toBe(280);
    expect(levelThreshold(5)).toBe(1120);
    expect(levelThreshold(10)).toBe(3160);
  });

  it('уровень по опыту', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(279)).toBe(1);
    expect(levelForXp(280)).toBe(2);
    expect(levelForXp(1120)).toBe(5);
  });

  it('прогресс до следующего уровня — доля от 0 до 1', () => {
    const progress = levelProgress(280);
    expect(progress.level).toBe(2);
    expect(progress.progress).toBe(0);
    expect(levelProgress(0).progress).toBe(0);
    expect(levelProgress(279).progress).toBeGreaterThan(0.9);
  });
});

describe('начисление опыта', () => {
  it('таблица соответствует ТЗ', () => {
    expect(XP_TABLE.dayLogged).toBe(20);
    expect(XP_TABLE.workoutFinished).toBe(30);
    expect(XP_TABLE.habitDone).toBe(5);
    expect(XP_TABLE.allHabitsDone).toBe(15);
    expect(XP_TABLE.weekStreak).toBe(50);
    expect(XP_TABLE.personalRecord).toBe(25);
    expect(xpFor('weightLogged')).toBe(5);
  });

  it('опыт не начисляется задним числом дальше 48 часов', () => {
    const now = new Date('2026-07-10T12:00:00');
    expect(isXpEligible('2026-07-10', now)).toBe(true);
    expect(isXpEligible('2026-07-09', now)).toBe(true);
    expect(isXpEligible('2026-07-08', now)).toBe(true);
    expect(isXpEligible('2026-07-06', now)).toBe(false);
  });

  it('за будущее опыт не начисляется', () => {
    expect(isXpEligible('2026-12-31', new Date('2026-07-10T12:00:00'))).toBe(false);
  });

  it('ключ дедупликации уникален по действию, дню и объекту', () => {
    expect(dedupeKey('habitDone', '2026-07-10', 'h1')).toBe('habitDone:2026-07-10:h1');
    expect(dedupeKey('dayLogged', '2026-07-10')).toBe('dayLogged:2026-07-10');
  });
});

describe('достижения', () => {
  it('их 28 и все ключи уникальны', () => {
    expect(ACHIEVEMENTS.length).toBe(28);
    expect(new Set(ACHIEVEMENTS.map((a) => a.key)).size).toBe(ACHIEVEMENTS.length);
  });

  it('ни одно достижение не завязано на вес или дефицит', () => {
    const metrics = ACHIEVEMENTS.map((a) => a.metric);
    expect(metrics).not.toContain('weightLost');
    expect(metrics.every((m) => !/weightLoss|deficit|bodyFat/i.test(m))).toBe(true);
  });

  it('открывает по достижению порога', () => {
    const statuses = evaluateAchievements({ workouts: 1 });
    expect(statuses.find((s) => s.def.key === 'firstWorkout')?.unlocked).toBe(true);
    expect(statuses.find((s) => s.def.key === 'workouts100')?.unlocked).toBe(false);
  });

  it('уже открытые остаются открытыми', () => {
    const statuses = evaluateAchievements({}, new Set(['firstWorkout']));
    expect(statuses.find((s) => s.def.key === 'firstWorkout')?.unlocked).toBe(true);
  });

  it('newlyUnlocked возвращает только новые', () => {
    const fresh = newlyUnlocked({ workouts: 25 }, new Set(['firstWorkout']));
    expect(fresh).toContain('workouts25');
    expect(fresh).not.toContain('firstWorkout');
  });

  it('прогресс ограничен единицей', () => {
    const statuses = evaluateAchievements({ workouts: 1000 });
    expect(statuses.find((s) => s.def.key === 'workouts100')?.progress).toBe(1);
  });
});

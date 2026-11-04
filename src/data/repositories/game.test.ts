import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepositories } from './dexie';
import { deleteDb, openDb } from '../db/schema';

const profileId = 'game-transaction-fixture';
let repos: ReturnType<typeof createRepositories>;
beforeEach(() => {
  repos = createRepositories(profileId);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await deleteDb(profileId);
});
const award = (dedupeKey: string) => ({
  reason: 'workoutFinished',
  amount: 30,
  date: '2026-11-04',
  dedupeKey,
});

describe('atomic progress updates', () => {
  it('awards the same action once across concurrent calls', async () => {
    const results = await Promise.all([
      repos.game.awardXp(award('same')),
      repos.game.awardXp(award('same')),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repos.game.events()).toHaveLength(1);
    expect((await repos.game.get()).xp).toBe(30);
  });
  it('retains every distinct concurrent award', async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        repos.game.awardXp(award(`event:${i}`)),
      ),
    );
    expect(await repos.game.events()).toHaveLength(5);
    expect((await repos.game.get()).xp).toBe(150);
  });
  it('rolls back the event when storing its total fails and allows a retry', async () => {
    vi.spyOn(openDb(profileId).gameState, 'put').mockRejectedValueOnce(
      new Error('storage full'),
    );
    await expect(repos.game.awardXp(award('retry'))).rejects.toThrow(
      'storage full',
    );
    expect(await repos.game.events()).toHaveLength(0);
    expect((await repos.game.get()).xp).toBe(0);
    expect(await repos.game.awardXp(award('retry'))).toBe(true);
    expect((await repos.game.get()).xp).toBe(30);
  });
  it('preserves different achievements discovered from stale snapshots', async () => {
    await Promise.all([
      repos.game.update({
        unlockedAchievements: [
          { key: 'firstWorkout', unlockedAt: '2026-11-04T10:00:00.000Z' },
        ],
      }),
      repos.game.update({
        unlockedAchievements: [
          { key: 'firstEntry', unlockedAt: '2026-11-04T10:00:00.000Z' },
        ],
      }),
    ]);
    expect(
      (await repos.game.get()).unlockedAchievements
        .map((item) => item.key)
        .sort(),
    ).toEqual(['firstEntry', 'firstWorkout']);
  });
});

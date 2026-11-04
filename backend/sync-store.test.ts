import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync as SQLite, SQLInputValue } from 'node:sqlite';
import type { Database, SqlStatement } from './db';
import { commitSyncBatch, pullSyncChanges, type SyncBatch } from './sync-store';

const { DatabaseSync } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof import('node:sqlite');
let sql: SQLite;
let db: Database;
beforeEach(() => {
  sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of [
    '0001_identity.sql',
    '0002_profiles.sql',
    '0003_sync.sql',
    '0004_attachments.sql',
    '0005_sync_budget.sql',
  ])
    sql.exec(
      readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8'),
    );
  sql.exec("INSERT INTO accounts VALUES ('a','1',0),('b','2',0)");
  sql.exec(
    "INSERT INTO profiles VALUES ('a','p','Fixture','a',1,0,0),('b','p','Other','a',1,0,0)",
  );
  const prepare = (query: string, values: unknown[] = []): SqlStatement => ({
    bind: (...next) => prepare(query, next),
    first: async <T>() =>
      (sql.prepare(query).get(...(values as SQLInputValue[])) ??
        null) as T | null,
    all: async <T>() => ({
      success: true,
      results: sql.prepare(query).all(...(values as SQLInputValue[])) as T[],
      meta: { changes: 0 },
    }),
    run: async () => ({
      success: true,
      results: [],
      meta: {
        changes: Number(
          sql.prepare(query).run(...(values as SQLInputValue[])).changes,
        ),
      },
    }),
  });
  db = {
    prepare,
    batch: async (statements) => {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
});
afterEach(() => sql.close());
const stamp = '2026-11-03T00:00:00.000Z';
const water = (id: string, revision = 0, ml = 250) => ({
  operationId: `op:${id}:${revision}`,
  type: 'water' as const,
  id,
  expectedRevision: revision,
  payload: {
    id,
    createdAt: stamp,
    updatedAt: stamp,
    date: '2026-11-03',
    time: '10:00',
    ml,
  },
});
const batch = (
  batchId: string,
  ...mutations: SyncBatch['mutations']
): SyncBatch => ({ schemaVersion: 1, batchId, mutations });
const push = (value: SyncBatch, account = 'a') =>
  commitSyncBatch(db, account, 'p', value);
const count = (table: string) =>
  (sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('transactional sync storage', () => {
  it('rolls back a quota failure without charging a receipt and permits earlier retries at the limit', async () => {
    const original = batch('first', water('w1'));
    const receipt = await push(original);
    // A receipt fits, but its following entity/change writes do not.
    sql.exec('UPDATE sync_budget SET used_bytes=100658296');
    await expect(push(batch('no-room', water('w2')))).rejects.toMatchObject({
      status: 413,
      code: 'sync_storage_quota',
    });
    expect(await push(original)).toEqual(receipt);
    expect(count('sync_receipts')).toBe(1);
    expect(count('sync_entities')).toBe(1);
    expect(
      sql.prepare('SELECT used_bytes FROM sync_budget').get(),
    ).toMatchObject({ used_bytes: 100658296 });
  });
  it('accounts for UTF-8 payloads, updates and fixture cleanup exactly', async () => {
    await push(batch('first', water('вода')));
    await push(batch('edit', water('вода', 1, 1000)));
    const expected = (
      sql
        .prepare(
          `SELECT
      (SELECT SUM(length(CAST(payload AS BLOB))+1024) FROM sync_entities) +
      (SELECT SUM(length(CAST(payload AS BLOB))+1024) FROM sync_changes) +
      (SELECT COUNT(*)*4096 FROM sync_receipts) AS n`,
        )
        .get() as { n: number }
    ).n;
    expect(
      sql.prepare('SELECT used_bytes FROM sync_budget').get(),
    ).toMatchObject({ used_bytes: expected });
    sql.exec(
      'DELETE FROM sync_changes; DELETE FROM sync_entities; DELETE FROM sync_receipts',
    );
    expect(
      sql.prepare('SELECT used_bytes FROM sync_budget').get(),
    ).toMatchObject({ used_bytes: 0 });
  });
  it('bounds page bytes and resumes without skipping large records', async () => {
    for (let i = 0; i < 8; i++) {
      const payload = {
        id: `recipe:${i}`,
        createdAt: stamp,
        updatedAt: stamp,
        name: 'Fixture',
        components: [],
        yieldGrams: 100,
        servings: 1,
        isFavorite: false,
        useCount: 0,
        steps: ['Ж'.repeat(15000), 'Ж'.repeat(15000)],
      };
      await push(
        batch(`large:${i}`, {
          id: payload.id,
          type: 'recipes',
          operationId: `large:${i}`,
          expectedRevision: 0,
          payload,
        }),
      );
    }
    const first = await pullSyncChanges(db, 'a', 'p');
    expect(first.done).toBe(false);
    expect(first.changes.length).toBeLessThan(8);
    const second = await pullSyncChanges(
      db,
      'a',
      'p',
      first.cursor,
      first.watermark,
    );
    expect(second.done).toBe(true);
    expect(
      new Set([...first.changes, ...second.changes].map((row) => row.id)).size,
    ).toBe(8);
  });
  it('loads a consistent compact snapshot while records are edited between pages', async () => {
    await push(batch('first', water('w1'), water('w2')));
    await push(batch('edit', water('w1', 1, 500)));
    const first = await pullSyncChanges(
      db,
      'a',
      'p',
      0,
      undefined,
      1,
      'snapshot',
    );
    expect(first.changes.map((change) => change.id)).toEqual(['w2']);
    await push(batch('later', water('w1', 2, 750)));
    const second = await pullSyncChanges(
      db,
      'a',
      'p',
      first.cursor,
      first.watermark,
      1,
      'snapshot',
    );
    expect(second.done).toBe(true);
    expect(
      second.changes.map((change) => [change.id, change.payload.ml]),
    ).toEqual([['w1', 500]]);
    const next = await pullSyncChanges(db, 'a', 'p', second.cursor);
    expect(next.changes.map((change) => change.payload.ml)).toEqual([750]);
  });
  it('returns the original receipt after a lost response even after the entity changes', async () => {
    const first = batch('first', water('w1'));
    const result = await push(first);
    await push(batch('edit', water('w1', 1, 500)));
    expect(await push(first)).toEqual(result);
    expect(count('sync_changes')).toBe(2);
    expect(count('sync_receipts')).toBe(2);
    expect(
      JSON.parse(
        (
          sql.prepare('SELECT payload FROM sync_entities').get() as {
            payload: string;
          }
        ).payload,
      ).ml,
    ).toBe(500);
  });
  it('rejects reuse of a batch ID with altered contents', async () => {
    await push(batch('first', water('w1')));
    await expect(
      push(batch('first', water('w1', 0, 999))),
    ).rejects.toMatchObject({ status: 409, code: 'sync_batch_reused' });
    expect(count('sync_changes')).toBe(1);
  });
  it('rolls back earlier writes and the receipt when a later mutation conflicts', async () => {
    await push(batch('first', water('w1')));
    await expect(
      push(batch('atomic', water('w2'), water('w1', 0, 999))),
    ).rejects.toMatchObject({ code: 'sync_revision_conflict' });
    expect(count('sync_entities')).toBe(1);
    expect(count('sync_changes')).toBe(1);
    expect(count('sync_receipts')).toBe(1);
    const corrected = await push(
      batch('atomic', water('w2'), water('w1', 1, 999)),
    );
    expect(corrected.map((row) => row.revision)).toEqual([1, 2]);
  });
  it('keeps account/profile ownership in every read and write', async () => {
    await push(batch('same', water('w1')), 'a');
    await push(batch('same', water('w1', 0, 500)), 'b');
    expect((await pullSyncChanges(db, 'a', 'p')).changes[0].payload.ml).toBe(
      250,
    );
    expect((await pullSyncChanges(db, 'b', 'p')).changes[0].payload.ml).toBe(
      500,
    );
    await expect(
      commitSyncBatch(db, 'a', 'missing', batch('x', water('w2'))),
    ).rejects.toMatchObject({ status: 404 });
    await expect(pullSyncChanges(db, 'foreign', 'p')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('preserves delete-versus-edit conflicts and requires explicit revision for undo', async () => {
    await push(batch('first', water('w1')));
    const deleted = water('w1', 1);
    await push(
      batch('delete', {
        ...deleted,
        payload: { ...deleted.payload, deletedAt: stamp },
      }),
    );
    await expect(
      push(batch('stale-edit', water('w1', 1, 300))),
    ).rejects.toMatchObject({ code: 'sync_revision_conflict' });
    await expect(
      push(batch('old-import', water('w1', 0))),
    ).rejects.toMatchObject({ code: 'sync_revision_conflict' });
    const restored = await push(batch('undo', water('w1', 2)));
    expect(restored[0].revision).toBe(3);
    expect(restored[0].payload.deletedAt).toBeUndefined();
  });
  it('pages a fixed watermark while later edits remain available to the next pull', async () => {
    await push(batch('first', water('w1'), water('w2')));
    const first = await pullSyncChanges(db, 'a', 'p', 0, undefined, 1);
    expect(first.done).toBe(false);
    await push(batch('later', water('w1', 1, 500)));
    const second = await pullSyncChanges(
      db,
      'a',
      'p',
      first.cursor,
      first.watermark,
      1,
    );
    expect(second.done).toBe(true);
    expect(second.changes[0].id).toBe('w2');
    const next = await pullSyncChanges(db, 'a', 'p', second.cursor);
    expect(next.changes).toHaveLength(1);
    expect(next.changes[0].payload.ml).toBe(500);
  });
  it('prevents a stable operation ID from being replayed in another batch', async () => {
    await push(batch('first', water('w1')));
    await expect(
      push(batch('other', { ...water('w1', 1), operationId: 'op:w1:0' })),
    ).rejects.toMatchObject({ status: 409 });
    expect(count('sync_changes')).toBe(1);
    expect(count('sync_receipts')).toBe(1);
  });
  it('deduplicates XP across different record IDs, including deleted events', async () => {
    const event = {
      operationId: 'xp:1',
      id: 'xp1',
      type: 'xpEvents' as const,
      expectedRevision: 0,
      payload: {
        id: 'xp1',
        createdAt: stamp,
        updatedAt: stamp,
        date: '2026-11-03',
        amount: 10,
        reason: 'workout',
        dedupeKey: 'workout:1',
        deletedAt: stamp,
      },
    };
    await push(batch('xp', event));
    await expect(
      push(
        batch('duplicate-xp', {
          ...event,
          operationId: 'xp:2',
          id: 'xp2',
          payload: { ...event.payload, id: 'xp2' },
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(count('sync_receipts')).toBe(1);
    expect(count('sync_entities')).toBe(1);
  });
  it('rejects malformed or oversized batches before any write', async () => {
    await expect(
      push(batch('duplicate', water('w1'), water('w1'))),
    ).rejects.toMatchObject({ status: 400 });
    await expect(push(batch('empty'))).rejects.toMatchObject({ status: 400 });
    await expect(
      push(
        batch('large', ...Array.from({ length: 21 }, (_, i) => water(`w${i}`))),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      push({
        ...batch('version', water('w1')),
        schemaVersion: 2,
      } as unknown as SyncBatch),
    ).rejects.toMatchObject({ status: 400 });
    expect(count('sync_receipts')).toBe(0);
  });
});

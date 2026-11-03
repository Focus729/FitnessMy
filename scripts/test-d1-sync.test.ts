import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Database, SqlStatement, SqlResult } from '../backend/db';
import {
  commitSyncBatch,
  pullSyncChanges,
  type SyncBatch,
} from '../backend/sync-store';

it('proves sync rollback, retry receipts, concurrent CAS and pagination on staging D1', async () => {
  // Deliberately fixed staging identifiers. Never accept a production target override.
  const account = '307ddcd17586753c4e5a1a3928316250';
  const database = '49e061b0-2191-453d-891a-abbd8c269e21';
  const token = (
    await readFile(
      join(
        process.env.APPDATA!,
        'xdg.config',
        '.wrangler',
        'config',
        'default.toml',
      ),
      'utf8',
    )
  ).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token) throw new Error('Wrangler session unavailable');
  type Query = { sql: string; params: unknown[] };
  async function query(body: Query | { batch: Query[] }): Promise<SqlResult[]> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
    const result = (await response.json()) as {
      success: boolean;
      result: SqlResult[];
      errors?: { message: string }[];
    };
    if (
      !response.ok ||
      !result.success ||
      result.result?.some((entry) => !entry.success)
    ) {
      const messages =
        result.errors?.map((entry) => entry.message).join(' ') ?? '';
      if (messages.includes('sync_revision_conflict'))
        throw new Error('sync_revision_conflict');
      if (messages.includes('UNIQUE constraint failed'))
        throw new Error('UNIQUE constraint failed');
      throw new Error(`Staging D1 request failed: HTTP ${response.status}`);
    }
    return result.result;
  }
  const queries = new WeakMap<SqlStatement, Query>();
  const prepare = (sql: string, params: unknown[] = []): SqlStatement => {
    const statement: SqlStatement = {
      bind: (...values) => prepare(sql, values),
      first: async <T>() =>
        ((await query({ sql, params }))[0].results[0] ?? null) as T | null,
      all: async <T>() => (await query({ sql, params }))[0] as SqlResult<T>,
      run: async () => (await query({ sql, params }))[0],
    };
    queries.set(statement, { sql, params });
    return statement;
  };
  const db: Database = {
    prepare,
    batch: (statements) =>
      query({ batch: statements.map((statement) => queries.get(statement)!) }),
  };
  const owner = `fixture:${randomUUID()}`;
  const stamp = '2026-11-03T00:00:00.000Z';
  const mutation = (id: string, expectedRevision = 0, ml = 250) => ({
    operationId: randomUUID(),
    type: 'water' as const,
    id,
    expectedRevision,
    payload: {
      id,
      createdAt: stamp,
      updatedAt: stamp,
      date: '2026-11-03',
      time: '10:00',
      ml,
    },
  });
  const batch = (...mutations: SyncBatch['mutations']): SyncBatch => ({
    schemaVersion: 1,
    batchId: randomUUID(),
    mutations,
  });
  const push = (input: SyncBatch) =>
    commitSyncBatch(db, owner, 'profile', input);
  const count = async (table: string) =>
    (await prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id=?`)
      .bind(owner)
      .first<{ n: number }>())!.n;
  try {
    await prepare('INSERT INTO accounts(id,github_id,created_at) VALUES(?,?,0)')
      .bind(owner, owner)
      .run();
    await prepare(
      "INSERT INTO profiles(account_id,id,name,tint,created_at,updated_at) VALUES(?,'profile','Fixture','a',0,0)",
    )
      .bind(owner)
      .run();
    const original = batch(mutation('w1'));
    const receipt = await push(original);
    expect(await push(original)).toEqual(receipt);
    const competing = await Promise.allSettled([
      push(batch(mutation('w1', 1, 300))),
      push(batch(mutation('w1', 1, 500))),
    ]);
    expect(
      competing.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const failed = competing.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: 'sync_revision_conflict' });
    expect(await push(original)).toEqual(receipt);
    const before = await count('sync_changes');
    await expect(
      push(batch(mutation('w2'), mutation('w1', 0))),
    ).rejects.toMatchObject({ code: 'sync_revision_conflict' });
    expect(await count('sync_changes')).toBe(before);
    expect(await count('sync_entities')).toBe(1);
    expect(await count('sync_receipts')).toBe(2);
    const first = await pullSyncChanges(db, owner, 'profile', 0, undefined, 1);
    await push(batch(mutation('w3')));
    const second = await pullSyncChanges(
      db,
      owner,
      'profile',
      first.cursor,
      first.watermark,
      1,
    );
    expect(second.done).toBe(true);
    const next = await pullSyncChanges(db, owner, 'profile', second.cursor);
    expect(next.changes.map((change) => change.id)).toEqual(['w3']);
    const snapshot = await pullSyncChanges(
      db,
      owner,
      'profile',
      0,
      undefined,
      1,
      'snapshot',
    );
    expect(snapshot.changes.map((change) => change.id)).toEqual(['w1']);
    await push(batch(mutation('w3', 1, 750)));
    const snapshotEnd = await pullSyncChanges(
      db,
      owner,
      'profile',
      snapshot.cursor,
      snapshot.watermark,
      1,
      'snapshot',
    );
    expect(snapshotEnd.done).toBe(true);
    expect(snapshotEnd.changes[0].payload.ml).toBe(250);
    const afterSnapshot = await pullSyncChanges(
      db,
      owner,
      'profile',
      snapshotEnd.cursor,
    );
    expect(afterSnapshot.changes.map((change) => change.payload.ml)).toEqual([
      750,
    ]);
    await expect(
      pullSyncChanges(db, `${owner}:foreign`, 'profile'),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    // Only this run's random synthetic owner; preserve all personal and other test records.
    for (const table of [
      'sync_changes',
      'sync_entities',
      'sync_receipts',
      'profiles',
    ])
      await prepare(`DELETE FROM ${table} WHERE account_id=?`)
        .bind(owner)
        .run();
    await prepare('DELETE FROM accounts WHERE id=?').bind(owner).run();
    expect(await count('sync_changes')).toBe(0);
  }
});

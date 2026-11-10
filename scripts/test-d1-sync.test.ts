import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { consumeSyncRequest } from '../backend/sync-rate-limit';
import { profileStorageUsage } from '../backend/storage-usage';
import {
  beginAttachment,
  CHUNK_BYTES,
  digestBytes,
  finalizeAttachment,
  putAttachmentChunk,
  readAttachmentChunk,
  restartAttachment,
} from '../backend/attachments';
import catalog from '../backend/catalog-ids.json';
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
      if (messages.includes('sync_xp_award_conflict'))
        throw new Error('sync_xp_award_conflict');
      if (messages.includes('sync_storage_quota'))
        throw new Error('sync_storage_quota');
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
  const initialBudget = await prepare(
    'SELECT used_bytes FROM sync_budget WHERE id=1',
  ).first<{ used_bytes: number }>();
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
    const bytes = Uint8Array.from(
      { length: CHUNK_BYTES + 17 },
      (_, i) => i % 251,
    );
    const manifest = {
      createdAt: stamp,
      id: 'photo1',
      mime: 'image/png',
      byteLength: bytes.length,
      digest: await digestBytes(bytes),
    };
    await beginAttachment(db, owner, 'profile', manifest);
    const recipe = batch({
      operationId: randomUUID(),
      type: 'recipes',
      id: 'recipe1',
      expectedRevision: 0,
      payload: {
        id: 'recipe1',
        createdAt: stamp,
        updatedAt: stamp,
        name: 'Fixture',
        components: [{ foodId: catalog.foods[0], grams: 100 }],
        yieldGrams: 100,
        servings: 1,
        photoBlobId: 'photo1',
        isFavorite: false,
        useCount: 0,
      },
    });
    await expect(push(recipe)).rejects.toMatchObject({
      code: 'entity_reference_unavailable',
    });
    const last = Buffer.from(bytes.slice(CHUNK_BYTES)).toString('base64');
    await putAttachmentChunk(db, owner, 'profile', 'photo1', 1, last);
    expect(
      (await beginAttachment(db, owner, 'profile', manifest)).uploaded,
    ).toEqual([1]);
    await expect(
      finalizeAttachment(db, owner, 'profile', 'photo1'),
    ).rejects.toMatchObject({ code: 'attachment_incomplete' });
    expect(
      (await restartAttachment(db, owner, 'profile', 'photo1', 0)).uploaded,
    ).toEqual([]);
    await putAttachmentChunk(db, owner, 'profile', 'photo1', 1, last);
    await expect(
      restartAttachment(db, owner, 'profile', 'photo1', 0),
    ).rejects.toMatchObject({ code: 'attachment_upload_changed' });
    await putAttachmentChunk(
      db,
      owner,
      'profile',
      'photo1',
      0,
      Buffer.from(bytes.slice(0, CHUNK_BYTES)).toString('base64'),
    );
    expect(
      (await finalizeAttachment(db, owner, 'profile', 'photo1')).finalized,
    ).toBe(true);
    await expect(
      restartAttachment(db, owner, 'profile', 'photo1', 1),
    ).rejects.toMatchObject({ code: 'attachment_finalized' });
    await putAttachmentChunk(db, owner, 'profile', 'photo1', 1, last);
    expect(
      (await readAttachmentChunk(db, owner, 'profile', 'photo1', 1)).data,
    ).toBe(last);
    expect(await push(recipe)).toHaveLength(1);
    await expect(
      readAttachmentChunk(db, `${owner}:foreign`, 'profile', 'photo1', 1),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pullSyncChanges(db, `${owner}:foreign`, 'profile'),
    ).rejects.toMatchObject({ status: 404 });
    await prepare(
      'INSERT INTO sync_rate_limits(account_id,operation,window_start,requests) VALUES(?,?,?,?)',
    )
      .bind(owner, 'write', 120, 59)
      .run();
    const large = batch(
      ...Array.from({ length: 200 }, (_, index) => mutation(`bulk-${index}`)),
    );
    const largeReceipt = await push(large);
    expect(largeReceipt).toHaveLength(200);
    expect(await push(large)).toEqual(largeReceipt);
    const beforeLargeFailure = await count('sync_changes');
    await expect(
      push(
        batch(
          ...Array.from({ length: 199 }, (_, index) =>
            mutation(`rollback-${index}`),
          ),
          mutation('bulk-0', 0),
        ),
      ),
    ).rejects.toMatchObject({ code: 'sync_revision_conflict' });
    expect(await count('sync_changes')).toBe(beforeLargeFailure);
    const award = (id: string, amount = 20) => ({
      operationId: randomUUID(),
      type: 'xpEvents' as const,
      id,
      expectedRevision: 0,
      payload: {
        id,
        createdAt: stamp,
        updatedAt: stamp,
        date: '2026-11-03',
        reason: 'workout',
        dedupeKey: 'workout:shared',
        amount,
      },
    });
    const awards = await Promise.all([
      push(batch(award('phone-xp'))),
      push(batch(award('pc-xp'))),
    ]);
    expect(awards.map(([change]) => change.id)).toEqual(['phone-xp', 'pc-xp']);
    const beforeAwardConflict = await count('sync_changes');
    await expect(
      push(batch(mutation('rollback-xp'), award('invalid-xp', 21))),
    ).rejects.toMatchObject({ code: 'sync_xp_award_conflict' });
    expect(await count('sync_changes')).toBe(beforeAwardConflict);
    const usage = await profileStorageUsage(db, owner, 'profile');
    expect(usage.records).toBeGreaterThan(0);
    expect(usage.changes).toBeGreaterThanOrEqual(usage.records);
    expect(usage.attachments).toBe(1);
    expect(usage.unfinishedAttachments).toBe(0);
    expect(usage.attachmentOriginalBytes).toBe(bytes.length);
    expect(usage.attachmentReservedBytes).toBeGreaterThan(bytes.length);
    const currentBudget = await prepare(
      'SELECT used_bytes FROM sync_budget WHERE id=1',
    ).first<{ used_bytes: number }>();
    expect(usage.syncLogicalBytes).toBe(
      currentBudget!.used_bytes - initialBudget!.used_bytes,
    );
    await expect(
      profileStorageUsage(db, `${owner}:foreign`, 'profile'),
    ).rejects.toMatchObject({ status: 404 });
    const admission = await Promise.allSettled([
      consumeSyncRequest(db, owner, 'write', 121),
      consumeSyncRequest(db, owner, 'write', 121),
    ]);
    expect(
      admission.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      admission.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      consumeSyncRequest(db, owner, 'write', 122),
    ).rejects.toMatchObject({ status: 429, retryAfter: 58 });
    await consumeSyncRequest(db, owner, 'write', 180);
  } finally {
    // Only this run's random synthetic owner; preserve all personal and other test records.
    for (const table of [
      'sync_changes',
      'sync_rate_limits',
      'sync_entities',
      'sync_receipts',
      'attachment_chunks',
      'attachments',
      'profiles',
    ])
      await prepare(`DELETE FROM ${table} WHERE account_id=?`)
        .bind(owner)
        .run();
    await prepare('DELETE FROM accounts WHERE id=?').bind(owner).run();
    expect(await count('sync_changes')).toBe(0);
    expect(
      await prepare('SELECT used_bytes FROM sync_budget WHERE id=1').first(),
    ).toEqual(initialBudget);
  }
});

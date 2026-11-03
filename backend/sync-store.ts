import type { Database } from './db';
import { HttpError } from './http';
import {
  validateCloudMutation,
  type CloudMutation,
} from '../src/data/cloud/schema';

export interface SyncBatch {
  schemaVersion: 1;
  batchId: string;
  mutations: CloudMutation[];
}
export interface Change {
  sequence: number;
  operationId: string;
  type: string;
  id: string;
  revision: number;
  payload: Record<string, unknown>;
}
interface ChangeRow {
  sequence: number;
  operation_id: string;
  entity_type: string;
  entity_id: string;
  expected_revision: number;
  payload: string;
}
const decode = (row: ChangeRow): Change => ({
  sequence: row.sequence,
  operationId: row.operation_id,
  type: row.entity_type,
  id: row.entity_id,
  revision: row.expected_revision + 1,
  payload: JSON.parse(row.payload) as Record<string, unknown>,
});
const identifier = (v: unknown) =>
  typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,200}$/.test(v);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function validateSyncBatch(value: unknown): asserts value is SyncBatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HttpError(400, 'invalid_sync_batch');
  const batch = value as SyncBatch;
  if (
    Object.keys(batch).some(
      (key) => !['schemaVersion', 'batchId', 'mutations'].includes(key),
    ) ||
    batch.schemaVersion !== 1 ||
    !identifier(batch.batchId) ||
    !Array.isArray(batch.mutations) ||
    batch.mutations.length < 1 ||
    batch.mutations.length > 20
  )
    throw new HttpError(400, 'invalid_sync_batch');
  const operations = new Set<string>();
  const entities = new Set<string>();
  for (const mutation of batch.mutations) {
    try {
      validateCloudMutation(mutation);
    } catch {
      throw new HttpError(400, 'invalid_sync_mutation');
    }
    const key = JSON.stringify([mutation.type, mutation.id]);
    if (operations.has(mutation.operationId) || entities.has(key))
      throw new HttpError(400, 'duplicate_sync_mutation');
    operations.add(mutation.operationId);
    entities.add(key);
  }
  if (new TextEncoder().encode(canonical(batch)).length > 256 * 1024)
    throw new HttpError(413, 'sync_batch_too_large');
}
async function owned(db: Database, account: string, profile: string) {
  if (
    !(await db
      .prepare('SELECT id FROM profiles WHERE account_id=? AND id=?')
      .bind(account, profile)
      .first())
  )
    throw new HttpError(404, 'profile_not_found');
}
const receiptQuery =
  'SELECT request_hash FROM sync_receipts WHERE account_id=? AND profile_id=? AND batch_id=?';
async function receiptResult(
  db: Database,
  account: string,
  profile: string,
  batch: string,
  hash: string,
) {
  const receipt = await db
    .prepare(receiptQuery)
    .bind(account, profile, batch)
    .first<{ request_hash: string }>();
  if (!receipt) return null;
  if (receipt.request_hash !== hash)
    throw new HttpError(409, 'sync_batch_reused');
  const rows = await db
    .prepare(
      'SELECT * FROM sync_changes WHERE account_id=? AND profile_id=? AND batch_id=? ORDER BY sequence',
    )
    .bind(account, profile, batch)
    .all<ChangeRow>();
  return rows.results.map(decode);
}

/** Internal storage primitive. HTTP wiring waits for references, attachments and quota gates. */
export async function commitSyncBatch(
  db: Database,
  account: string,
  profile: string,
  input: unknown,
): Promise<Change[]> {
  validateSyncBatch(input);
  // Snapshot before awaits: callers cannot change the hashed request while D1 is running.
  const batch = JSON.parse(canonical(input)) as SyncBatch;
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(canonical(batch)),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  await owned(db, account, profile);
  const previous = await receiptResult(
    db,
    account,
    profile,
    batch.batchId,
    hash,
  );
  if (previous) return previous;
  const token = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        `INSERT INTO sync_receipts(account_id,profile_id,batch_id,request_hash,commit_token,created_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,profile_id,batch_id) DO NOTHING`,
      )
      .bind(account, profile, batch.batchId, hash, token, Date.now()),
  ];
  for (const mutation of batch.mutations)
    statements.push(
      db
        .prepare(
          `
    INSERT INTO sync_changes(account_id,profile_id,batch_id,operation_id,entity_type,entity_id,expected_revision,payload)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_receipts
      WHERE account_id=? AND profile_id=? AND batch_id=? AND commit_token=?)`,
        )
        .bind(
          account,
          profile,
          batch.batchId,
          mutation.operationId,
          mutation.type,
          mutation.id,
          mutation.expectedRevision,
          canonical(mutation.payload),
          account,
          profile,
          batch.batchId,
          token,
        ),
    );
  try {
    await db.batch(statements);
  } catch (error) {
    // Only static categories escape. Never return SQL, bound values or provider diagnostics.
    const message = error instanceof Error ? error.message : '';
    if (message.includes('sync_revision_conflict'))
      throw new HttpError(409, 'sync_revision_conflict');
    if (message.includes('UNIQUE constraint failed'))
      throw new HttpError(409, 'sync_duplicate_operation');
    throw new HttpError(503, 'sync_commit_failed');
  }
  const result = await receiptResult(db, account, profile, batch.batchId, hash);
  if (!result || result.length !== batch.mutations.length)
    throw new HttpError(503, 'sync_receipt_unavailable');
  return result;
}

/** Snapshot selects each entity's latest historical version at a fixed watermark, including tombstones. */
export async function pullSyncChanges(
  db: Database,
  account: string,
  profile: string,
  after = 0,
  watermark?: number,
  limit = 50,
  mode: 'changes' | 'snapshot' = 'changes',
): Promise<{
  changes: Change[];
  cursor: number;
  watermark: number;
  done: boolean;
}> {
  if (
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (watermark !== undefined &&
      (!Number.isSafeInteger(watermark) || watermark < after))
  )
    throw new HttpError(400, 'invalid_sync_cursor');
  await owned(db, account, profile);
  const latest = await db
    .prepare(
      'SELECT COALESCE(MAX(sequence),0) AS sequence FROM sync_changes WHERE account_id=? AND profile_id=?',
    )
    .bind(account, profile)
    .first<{ sequence: number }>();
  const maximum = latest?.sequence ?? 0;
  if (after > maximum || (watermark !== undefined && watermark > maximum))
    throw new HttpError(400, 'invalid_sync_cursor');
  const until = watermark ?? maximum;
  const rows = await db
    .prepare(
      `SELECT c.* FROM sync_changes c WHERE account_id=? AND profile_id=?
    AND sequence>? AND sequence<=?
    ${
      mode === 'snapshot'
        ? `AND NOT EXISTS (
      SELECT 1 FROM sync_changes newer WHERE newer.account_id=c.account_id AND newer.profile_id=c.profile_id
      AND newer.entity_type=c.entity_type AND newer.entity_id=c.entity_id AND newer.sequence>c.sequence AND newer.sequence<=?
    )`
        : ''
    }
    ORDER BY sequence LIMIT ?`,
    )
    .bind(
      account,
      profile,
      after,
      until,
      ...(mode === 'snapshot' ? [until] : []),
      limit + 1,
    )
    .all<ChangeRow>();
  const changes: Change[] = [];
  let bytes = 0;
  for (const row of rows.results.slice(0, limit)) {
    const change = decode(row);
    const size = new TextEncoder().encode(JSON.stringify(change)).length;
    if (changes.length && bytes + size > 256 * 1024) break;
    changes.push(change);
    bytes += size;
  }
  const done = rows.results.length === changes.length;
  return {
    changes,
    cursor: done ? until : changes.at(-1)!.sequence,
    watermark: until,
    done,
  };
}

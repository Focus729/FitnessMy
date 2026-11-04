import type { Database } from './db';
import { HttpError } from './http';

export interface ProfileStorageUsage {
  records: number;
  changes: number;
  receipts: number;
  syncLogicalBytes: number;
  attachments: number;
  unfinishedAttachments: number;
  attachmentOriginalBytes: number;
  attachmentReservedBytes: number;
}

/** One read snapshot; owner predicates apply to every aggregate. No payloads leave D1. */
export async function profileStorageUsage(
  db: Database,
  accountId: string,
  profileId: string,
): Promise<ProfileStorageUsage> {
  let row: ProfileStorageUsage | null;
  try {
    row = await db
      .prepare(
        `
      WITH owned AS (SELECT account_id,id FROM profiles WHERE account_id=? AND id=?),
      entities AS (SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(payload AS BLOB))+1024),0) AS bytes
        FROM sync_entities WHERE account_id=? AND profile_id=?),
      changes AS (SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(payload AS BLOB))+1024),0) AS bytes
        FROM sync_changes WHERE account_id=? AND profile_id=?),
      receipts AS (SELECT COUNT(*) AS n FROM sync_receipts WHERE account_id=? AND profile_id=?),
      files AS (SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN finalized=0 THEN 1 ELSE 0 END),0) AS unfinished,
        COALESCE(SUM(byte_length),0) AS original, COALESCE(SUM(reserved_bytes),0) AS reserved
        FROM attachments WHERE account_id=? AND profile_id=?)
      SELECT entities.n AS records, changes.n AS changes, receipts.n AS receipts,
        entities.bytes+changes.bytes+receipts.n*4096 AS syncLogicalBytes,
        files.n AS attachments, files.unfinished AS unfinishedAttachments,
        files.original AS attachmentOriginalBytes, files.reserved AS attachmentReservedBytes
      FROM owned,entities,changes,receipts,files
    `,
      )
      .bind(
        accountId,
        profileId,
        accountId,
        profileId,
        accountId,
        profileId,
        accountId,
        profileId,
        accountId,
        profileId,
      )
      .first<ProfileStorageUsage>();
  } catch {
    throw new HttpError(503, 'storage_usage_unavailable');
  }
  if (!row) throw new HttpError(404, 'profile_not_found');
  return row;
}

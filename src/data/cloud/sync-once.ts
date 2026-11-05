import type { LentaDB } from '../db/schema';
import { prepareNextBatch, type PreparedBatch } from './prepare';
import { completePreparedBatch } from './complete';
import { receivePage, type RemotePage, type RemoteChange } from './receive';

export interface SyncTransport {
  push(
    body: PreparedBatch['body'],
  ): Promise<{ batchId: string; changes: RemoteChange[] }>;
  pull(after: number, watermark?: number): Promise<RemotePage>;
}

/** Bounded foreground cycle. Transport failures retain the exact retry request and all local edits. */
export async function syncOnce(
  db: LentaDB,
  accountId: string,
  profileId: string,
  transport: SyncTransport,
): Promise<void> {
  let pushError: unknown;
  const prepared = await prepareNextBatch(db, accountId, profileId);
  if (prepared) {
    try {
      const response = await transport.push(prepared.body);
      if (response.batchId !== prepared.body.batchId)
        throw new Error('sync_batch_changed');
      await completePreparedBatch(
        db,
        accountId,
        profileId,
        response.batchId,
        response.changes.map((change) => ({
          operationId: change.operationId,
          entityType: change.type,
          entityId: change.id,
          revision: change.revision,
        })),
      );
    } catch (error) {
      // Only a confirmed server conflict allows pulling divergent versions; a network failure
      // must leave the persisted request untouched for an exact retry.
      if (
        !error ||
        typeof error !== 'object' ||
        !('status' in error) ||
        error.status !== 409
      )
        throw error;
      pushError = error;
    }
  }
  for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
    const checkpoint = await db
      .table<{ key: string; cursor: number; watermark: number }, string>(
        'cloudState',
      )
      .get('pull');
    const cursor = checkpoint?.cursor ?? 0;
    const watermark =
      checkpoint && checkpoint.cursor < checkpoint.watermark
        ? checkpoint.watermark
        : undefined;
    const page = await transport.pull(cursor, watermark);
    if (watermark !== undefined && page.watermark !== watermark)
      throw new Error('sync_watermark_changed');
    if (!page.done && page.cursor <= cursor)
      throw new Error('sync_cursor_not_advancing');
    await receivePage(db, accountId, profileId, cursor, page);
    if (page.done) {
      if (pushError) throw pushError;
      return;
    }
  }
  if (pushError) throw pushError;
}

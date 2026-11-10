import type { LentaDB } from '../db/schema';
import { prepareNextBatch, type PreparedBatch } from './prepare';
import { completePreparedBatch } from './complete';
import { receivePage, type RemotePage, type RemoteChange } from './receive';
import { downloadAttachment, type FileTransport } from './attachments';
import { uploadFirstTransactionFiles } from './file-queue';
import type { BlobRecord } from '../../domain/model';

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
  fileTransport?: FileTransport,
  evaluationDate?: string,
): Promise<{ pullComplete: boolean }> {
  let pushError: unknown;
  if (fileTransport)
    await uploadFirstTransactionFiles(db, accountId, profileId, fileTransport);
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
      // Conflicting award data needs a reviewed repair before history can be reconciled.
      if ('code' in error && error.code === 'sync_xp_award_conflict')
        throw error;
      pushError = error;
      if ('code' in error && error.code === 'sync_revision_conflict') {
        await db.transaction('rw', db.cloudState, async () => {
          const state = db.table('cloudState');
          const current = await state.get('push');
          const link = await db.cloudState.get('link');
          if (
            current?.body.batchId !== prepared.body.batchId ||
            link?.accountId !== accountId ||
            link?.profileId !== profileId ||
            link.locked
          )
            throw new Error('cloud_workspace_changed');
          await state.put({
            key: 'rejectedPush',
            batchId: prepared.body.batchId,
          });
        });
      }
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
    const files: BlobRecord[] = [];
    for (const id of new Set(
      page.changes
        .filter((change) => change.type === 'recipes')
        .map((change) => change.payload.photoBlobId)
        .filter((id): id is string => typeof id === 'string'),
    )) {
      if (await db.blobs.get(id)) continue;
      if (!fileTransport) throw new Error('sync_attachment_missing');
      files.push(await downloadAttachment(id, fileTransport));
    }
    await receivePage(
      db,
      accountId,
      profileId,
      cursor,
      page,
      files,
      evaluationDate,
    );
    if (page.done) {
      if (pushError) throw pushError;
      return { pullComplete: true };
    }
  }
  if (pushError) throw pushError;
  return { pullComplete: false };
}

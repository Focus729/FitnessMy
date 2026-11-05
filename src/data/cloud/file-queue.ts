import type { LentaDB } from '../db/schema';
import type { BlobRecord } from '../../domain/model';
import { uploadAttachment, type FileTransport } from './attachments';

/** Upload immutable files before publishing their referring records. Server retains orphan files. */
export async function uploadFirstTransactionFiles(
  db: LentaDB,
  accountId: string,
  profileId: string,
  transport: FileTransport,
): Promise<void> {
  const link = await db.cloudState.get('link');
  if (
    !link ||
    link.locked ||
    link.accountId !== accountId ||
    link.profileId !== profileId
  )
    throw new Error('cloud_workspace_changed');
  const first = await db.cloudOutbox.orderBy('sequence').first();
  if (!first) return;
  const entries = await db.cloudOutbox
    .where('transactionId')
    .equals(first.transactionId)
    .toArray();
  for (const entry of entries.filter((item) => item.entityType === 'blobs')) {
    if (entry.accountId !== accountId || entry.profileId !== profileId)
      throw new Error('cloud_workspace_changed');
    if (entry.kind !== 'delete')
      await uploadAttachment(entry.value as unknown as BlobRecord, transport);
    await db.transaction(
      'rw',
      db.cloudState,
      db.cloudOutbox,
      db.cloudVersions,
      async () => {
        const currentLink = await db.cloudState.get('link');
        if (
          !currentLink ||
          currentLink.locked ||
          currentLink.accountId !== accountId ||
          currentLink.profileId !== profileId
        )
          throw new Error('cloud_workspace_changed');
        const current = await db.cloudOutbox.get(entry.sequence!);
        if (current?.operationId !== entry.operationId)
          throw new Error('sync_attachment_changed');
        await db.cloudOutbox.delete(entry.sequence!);
        const version = await db.cloudVersions.get(['blobs', entry.entityId]);
        if (version?.localHead === entry.operationId) {
          delete version.localHead;
          await db.cloudVersions.put(version);
        }
      },
    );
  }
}

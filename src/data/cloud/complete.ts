import type { LentaDB } from '../db/schema';
import { acknowledgeOperations, type OperationReceipt } from './acknowledge';
import type { PreparedBatch } from './prepare';

/** A response cannot clear the persisted retry request independently from its outbox entries. */
export async function completePreparedBatch(
  db: LentaDB,
  accountId: string,
  profileId: string,
  batchId: string,
  receipts: OperationReceipt[],
): Promise<void> {
  await db.transaction(
    'rw',
    db.cloudState,
    db.cloudOutbox,
    db.cloudVersions,
    async () => {
      const link = await db.cloudState.get('link');
      if (
        !link ||
        link.locked ||
        link.accountId !== accountId ||
        link.profileId !== profileId
      )
        throw new Error('cloud_workspace_changed');
      const state = db.table('cloudState');
      const prepared = (await state.get('push')) as PreparedBatch | undefined;
      if (
        !prepared ||
        prepared.body.batchId !== batchId ||
        prepared.accountId !== accountId ||
        prepared.profileId !== profileId
      ) {
        throw new Error('sync_batch_changed');
      }
      const expected = prepared.body.mutations;
      if (
        receipts.length !== expected.length ||
        new Set(receipts.map((item) => item.operationId)).size !==
          receipts.length ||
        receipts.some(
          (item) =>
            !expected.some(
              (mutation) =>
                mutation.operationId === item.operationId &&
                mutation.id === item.entityId &&
                mutation.type === item.entityType &&
                mutation.expectedRevision + 1 === item.revision,
            ),
        )
      )
        throw new Error('invalid_sync_receipt');
      await acknowledgeOperations(db, accountId, profileId, receipts);
      await state.delete('push');
    },
  );
}

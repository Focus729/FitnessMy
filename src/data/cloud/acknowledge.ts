import type { LentaDB } from '../db/schema';
import type { CloudVersion } from './outbox';

export interface OperationReceipt {
  operationId: string;
  entityType: string;
  entityId: string;
  revision: number;
}

/** Apply only receipts matched to a persisted request; never clear later local edits. */
export async function acknowledgeOperations(
  db: LentaDB,
  accountId: string,
  profileId: string,
  receipts: OperationReceipt[],
): Promise<void> {
  if (
    new Set(receipts.map((receipt) => receipt.operationId)).size !==
      receipts.length ||
    receipts.some(
      (receipt) =>
        !Number.isSafeInteger(receipt.revision) || receipt.revision < 1,
    )
  ) {
    throw new Error('invalid_sync_receipt');
  }
  await db.transaction(
    'rw',
    db.cloudState,
    db.cloudOutbox,
    db.cloudVersions,
    async () => {
      const link = await db.cloudState.get('link');
      if (
        !link ||
        link.accountId !== accountId ||
        link.profileId !== profileId ||
        link.locked
      )
        throw new Error('cloud_workspace_changed');
      for (const receipt of receipts) {
        const key: [string, string] = [receipt.entityType, receipt.entityId];
        const version = await db.cloudVersions.get(key);
        const entry = await db.cloudOutbox
          .where('operationId')
          .equals(receipt.operationId)
          .first();
        if (!entry) {
          if (
            version?.acknowledgedOperationId === receipt.operationId &&
            version.acknowledgedRevision === receipt.revision
          )
            continue;
          throw new Error('unknown_sync_receipt');
        }
        if (
          entry.accountId !== accountId ||
          entry.profileId !== profileId ||
          entry.entityType !== receipt.entityType ||
          entry.entityId !== receipt.entityId
        )
          throw new Error('invalid_sync_receipt');
        const expectedBase = entry.predecessor
          ? version?.acknowledgedOperationId === entry.predecessor
            ? version.acknowledgedRevision
            : undefined
          : entry.baseRevision;
        if (expectedBase === undefined || receipt.revision !== expectedBase + 1)
          throw new Error('sync_receipt_revision_mismatch');
        const next: CloudVersion = {
          ...version,
          entityType: receipt.entityType,
          entityId: receipt.entityId,
          serverRevision: Math.max(
            version?.serverRevision ?? 0,
            receipt.revision,
          ),
          acknowledgedOperationId: receipt.operationId,
          acknowledgedRevision: receipt.revision,
        };
        if (next.localHead === receipt.operationId) delete next.localHead;
        await db.cloudVersions.put(next);
        await db.cloudOutbox.delete(entry.sequence!);
      }
    },
  );
}

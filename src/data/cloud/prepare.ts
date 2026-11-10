import type { LentaDB } from '../db/schema';
import { MAX_BATCH_MUTATIONS, MAX_BATCH_BYTES } from './limits';
import {
  isCatalogType,
  validateCloudMutation,
  type CloudMutation,
} from './schema';
import { catalogWirePayload } from './catalog';
import { loadCatalogRows } from '../seed/catalog-rows';
import { progressEnvelope, type ProgressMetadata } from './progress-wire';
import type { GameState } from '../../domain/model';

export interface PreparedBatch {
  key: 'push';
  accountId: string;
  profileId: string;
  body: { schemaVersion: 1; batchId: string; mutations: CloudMutation[] };
}

/** Persist an immutable request before network I/O. Retrying must use these exact bytes/IDs. */
export async function prepareNextBatch(
  db: LentaDB,
  accountId: string,
  profileId: string,
): Promise<PreparedBatch | null> {
  // Imports must finish before IndexedDB opens the write transaction.
  const catalog = await loadCatalogRows();
  return db.transaction(
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
      const state = db.table<PreparedBatch, string>('cloudState');
      const previous = await state.get('push');
      if (previous) {
        if (
          previous.accountId !== accountId ||
          previous.profileId !== profileId
        )
          throw new Error('cloud_workspace_changed');
        return previous;
      }
      const first = await db.cloudOutbox.orderBy('sequence').first();
      if (!first) return null;
      const entries = await db.cloudOutbox
        .where('transactionId')
        .equals(first.transactionId)
        .sortBy('sequence');
      // Never split a related transaction silently. Import/workout planners must respect this bound.
      if (entries.length > MAX_BATCH_MUTATIONS)
        throw new Error('sync_transaction_too_large');
      const mutations: CloudMutation[] = [];
      for (const entry of entries) {
        if (entry.accountId !== accountId || entry.profileId !== profileId)
          throw new Error('cloud_workspace_changed');
        const version = await db.cloudVersions.get([
          entry.entityType,
          entry.entityId,
        ]);
        if (version?.conflict) throw new Error('sync_conflict_pending');
        const expectedRevision = entry.predecessor
          ? version?.acknowledgedOperationId === entry.predecessor
            ? version.acknowledgedRevision
            : undefined
          : entry.baseRevision;
        if (expectedRevision === undefined)
          throw new Error('sync_predecessor_pending');
        let payload = structuredClone(entry.value);
        if (entry.entityType === 'gameState') {
          const metadata = await db
            .table<ProgressMetadata, string>('cloudState')
            .get('progress');
          if (!metadata || entry.kind === 'delete')
            throw new Error('sync_progress_baseline_required');
          payload = progressEnvelope(payload as unknown as GameState, metadata);
        }
        if (entry.kind === 'delete')
          payload.deletedAt = new Date(entry.createdAt).toISOString();
        if (isCatalogType(entry.entityType) && payload.source === 'seed')
          payload = catalogWirePayload(entry.entityType, payload, catalog);
        const mutation = {
          operationId: entry.operationId,
          type: entry.entityType,
          id: entry.entityId,
          expectedRevision,
          payload,
        };
        validateCloudMutation(mutation);
        mutations.push(mutation);
      }
      const prepared: PreparedBatch = {
        key: 'push',
        accountId,
        profileId,
        body: { schemaVersion: 1, batchId: crypto.randomUUID(), mutations },
      };
      if (
        new TextEncoder().encode(JSON.stringify(prepared.body)).length >
        MAX_BATCH_BYTES
      )
        throw new Error('sync_transaction_too_large');
      await state.put(prepared);
      return prepared;
    },
  );
}

import type { LentaDB } from '../db/schema';
import { CLOUD_ENTITY_TYPES, validateCloudEntity } from './schema';
import { withoutCloudCapture, type OutboxEntry } from './outbox';
import {
  progressEnvelope,
  storeProgressEnvelope,
  type ProgressMetadata,
} from './progress-wire';
import { deriveHydratedProgress } from './derive-progress';
import { deriveWorkoutTotals } from './derive-workouts';
import type { GameState } from '../../domain/model';

/** Called only after an explicit choice, with the exact versions shown to the user. */
export async function resolveConflict(
  db: LentaDB,
  accountId: string,
  profileId: string,
  type: string,
  id: string,
  expectedRemoteRevision: number,
  expectedLocalHead: string | undefined,
  choice: 'local' | 'remote' | 'merge',
  evaluationDate?: string,
): Promise<void> {
  if (
    type === 'gameState'
      ? choice !== 'merge' || !evaluationDate
      : choice !== 'local' && choice !== 'remote'
  )
    throw new Error('invalid_conflict_choice');
  await withoutCloudCapture(
    db,
    [...CLOUD_ENTITY_TYPES, 'cloudState', 'cloudOutbox', 'cloudVersions'],
    async () => {
      const link = await db.cloudState.get('link');
      if (
        !link ||
        link.locked ||
        link.accountId !== accountId ||
        link.profileId !== profileId
      )
        throw new Error('cloud_workspace_changed');
      const key: [string, string] = [type, id];
      const version = await db.cloudVersions.get(key);
      if (
        !version?.conflict ||
        version.conflict.revision !== expectedRemoteRevision ||
        version.localHead !== expectedLocalHead
      )
        throw new Error('sync_conflict_changed');
      const state = db.table('cloudState');
      const prepared = await state.get('push');
      const rejected = await state.get('rejectedPush');
      if (prepared && rejected?.batchId !== prepared.body.batchId)
        throw new Error('sync_request_in_flight');
      const entries = await db.cloudOutbox
        .where('[entityType+entityId]')
        .equals(key)
        .sortBy('sequence');
      const local = await db.table(type).get(id);
      const last = entries.at(-1);
      let payload =
        choice === 'remote'
          ? structuredClone(version.conflict.payload)
          : structuredClone(local ?? last?.value);
      if (!payload) throw new Error('sync_local_version_missing');
      if (choice === 'local' && !local && last?.kind === 'delete')
        payload.deletedAt = new Date(last.createdAt).toISOString();
      // Local settings may contain excluded fields; validate the stored outbox projection instead.
      if (choice === 'local' && last)
        payload = {
          ...last.value,
          ...(last.kind === 'delete'
            ? { deletedAt: new Date(last.createdAt).toISOString() }
            : {}),
        };
      if (choice === 'merge') {
        if (!last || last.kind === 'delete')
          throw new Error('sync_local_version_missing');
        await storeProgressEnvelope(db, version.conflict.payload);
        const metadata = await db
          .table<ProgressMetadata, string>('cloudState')
          .get('progress');
        if (!metadata) throw new Error('sync_progress_baseline_required');
        // Validate the eventual retry without replacing the raw local queue snapshot.
        progressEnvelope(last.value as unknown as GameState, metadata);
        payload = last.value;
        await deriveHydratedProgress(db, evaluationDate!);
      } else {
        validateCloudEntity(type, payload);
      }
      await state.put({
        key: `conflictRecovery:${crypto.randomUUID()}`,
        accountId,
        profileId,
        type,
        id,
        local,
        entries,
        remote: version.conflict,
        resolvedAt: Date.now(),
        choice,
      });
      for (const entry of entries) await db.cloudOutbox.delete(entry.sequence!);
      const next = { ...version };
      delete next.conflict;
      delete next.localHead;
      if (choice !== 'remote') {
        const operationId = crypto.randomUUID();
        const entry: OutboxEntry = {
          operationId,
          transactionId: entries[0]?.transactionId ?? crypto.randomUUID(),
          accountId,
          profileId,
          entityType: type,
          entityId: id,
          kind: 'put',
          value: payload,
          baseRevision: expectedRemoteRevision,
          status: 'pending',
          createdAt: Date.now(),
          ...(entries[0]?.sequence === undefined
            ? {}
            : { sequence: entries[0].sequence }),
        };
        await db.cloudOutbox.put(entry);
        next.localHead = operationId;
      } else {
        if (type === 'settings' || type === 'profile') {
          const keys =
            type === 'settings'
              ? ['ai', 'sync', 'locale', 'theme', 'restTimer', 'onboardingDone']
              : ['pinHash'];
          for (const field of keys)
            if (local && Object.hasOwn(local, field))
              payload[field] = local[field];
        }
        await db.table(type).put(payload);
        if (type === 'workouts') await deriveWorkoutTotals(db, [id]);
        if (type === 'workoutSets') {
          const workouts = [local?.workoutId, payload.workoutId].filter(
            (value): value is string => typeof value === 'string',
          );
          await deriveWorkoutTotals(db, workouts);
        }
      }
      await db.cloudVersions.put(next);
      if (prepared) {
        await state.delete('push');
        await state.delete('rejectedPush');
      }
    },
  );
}

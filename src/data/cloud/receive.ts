import type { LentaDB } from '../db/schema';
import { withoutCloudCapture } from './outbox';
import { validateCloudEntity, CLOUD_ENTITY_TYPES } from './schema';
import { defaultSettings } from '../defaults';
import type { BlobRecord } from '../../domain/model';

export interface RemoteChange {
  sequence: number;
  operationId: string;
  type: string;
  id: string;
  revision: number;
  payload: Record<string, unknown>;
}
export interface RemotePage {
  changes: RemoteChange[];
  cursor: number;
  watermark: number;
  done: boolean;
}

/** Persist the cursor with applied data/conflicts; a crash cannot skip unapplied changes. */
export async function receivePage(
  db: LentaDB,
  accountId: string,
  profileId: string,
  expectedCursor: number,
  page: RemotePage,
  files: BlobRecord[] = [],
): Promise<void> {
  if (
    !Array.isArray(page.changes) ||
    page.changes.length > 100 ||
    typeof page.done !== 'boolean' ||
    ![expectedCursor, page.cursor, page.watermark].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    page.cursor < expectedCursor ||
    page.cursor > page.watermark ||
    (page.done && page.cursor !== page.watermark)
  )
    throw new Error('invalid_sync_page');
  let last = expectedCursor;
  for (const change of page.changes) {
    validateCloudEntity(change.type, change.payload);
    if (
      !Number.isSafeInteger(change.sequence) ||
      change.sequence <= last ||
      change.sequence > page.cursor ||
      !Number.isSafeInteger(change.revision) ||
      change.revision < 1 ||
      change.payload.id !== change.id
    )
      throw new Error('invalid_sync_page');
    last = change.sequence;
  }
  const stores = [
    'blobs',
    ...CLOUD_ENTITY_TYPES,
    'cloudState',
    'cloudOutbox',
    'cloudVersions',
  ];
  await withoutCloudCapture(db, stores, async () => {
    const link = await db.cloudState.get('link');
    if (
      !link ||
      link.accountId !== accountId ||
      link.profileId !== profileId ||
      link.locked
    )
      throw new Error('cloud_workspace_changed');
    const state = db.table<
      { key: string; cursor: number; watermark: number },
      string
    >('cloudState');
    const checkpoint = await state.get('pull');
    if ((checkpoint?.cursor ?? 0) !== expectedCursor)
      throw new Error('sync_cursor_changed');
    for (const file of files) {
      if (
        !(file.data instanceof Blob) ||
        !page.changes.some(
          (change) =>
            change.type === 'recipes' && change.payload.photoBlobId === file.id,
        )
      )
        throw new Error('unexpected_sync_attachment');
      if (!(await db.blobs.get(file.id))) await db.blobs.put(file);
    }
    for (const change of page.changes) {
      if (
        change.type === 'recipes' &&
        typeof change.payload.photoBlobId === 'string' &&
        !(await db.blobs.get(change.payload.photoBlobId))
      )
        throw new Error('sync_attachment_missing');
    }
    for (const change of page.changes) {
      const key: [string, string] = [change.type, change.id];
      const version = await db.cloudVersions.get(key);
      if ((version?.remoteSequence ?? 0) >= change.sequence) continue;
      const pending = await db.cloudOutbox
        .where('[entityType+entityId]')
        .equals(key)
        .toArray();
      const ownEcho =
        pending.some((entry) => entry.operationId === change.operationId) ||
        version?.acknowledgedOperationId === change.operationId;
      if (pending.length && !ownEcho) {
        await db.cloudVersions.put({
          ...version,
          entityType: change.type,
          entityId: change.id,
          serverRevision: Math.max(
            version?.serverRevision ?? 0,
            change.revision,
          ),
          remoteSequence: change.sequence,
          conflict: {
            revision: change.revision,
            payload: structuredClone(change.payload),
            operationId: change.operationId,
          },
        });
        continue;
      }
      if (
        !pending.length &&
        change.revision >= (version?.serverRevision ?? 0)
      ) {
        let value = structuredClone(change.payload);
        // Preserve excluded device-local settings and PIN while applying shared fields.
        if (change.type === 'settings' || change.type === 'profile') {
          const local =
            (await db.table(change.type).get(change.id)) ??
            (change.type === 'settings' ? defaultSettings() : undefined);
          const keys =
            change.type === 'settings'
              ? ['ai', 'sync', 'locale', 'theme', 'restTimer', 'onboardingDone']
              : ['pinHash'];
          value = { ...value };
          for (const key of keys)
            if (local && Object.hasOwn(local, key)) value[key] = local[key];
        }
        await db.table(change.type).put(value);
      }
      await db.cloudVersions.put({
        ...version,
        entityType: change.type,
        entityId: change.id,
        serverRevision: Math.max(version?.serverRevision ?? 0, change.revision),
        remoteSequence: change.sequence,
      });
    }
    await state.put({
      key: 'pull',
      cursor: page.cursor,
      watermark: page.watermark,
    });
  });
}

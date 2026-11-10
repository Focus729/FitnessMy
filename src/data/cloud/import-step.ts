import type { LentaDB } from '../db/schema';
import { uploadAttachment, type FileTransport } from './attachments';
import type { CloudImportPlan } from './migration-preview';
import type { SyncTransport } from './sync-once';

interface ImportCheckpoint {
  key: 'import';
  accountId: string;
  targetProfileId: string;
  fingerprint: string;
  nextFile: number;
  nextBatch: number;
}

/** Run one resumable step against an already reserved import target. */
export async function runImportStep(
  db: LentaDB,
  accountId: string,
  plan: CloudImportPlan,
  transport: { sync: Pick<SyncTransport, 'push'>; files: FileTransport },
): Promise<{ files: number; batches: number; done: boolean }> {
  const state = db.table<ImportCheckpoint, string>('cloudState');
  const matches = (checkpoint: ImportCheckpoint) =>
    checkpoint.accountId === accountId &&
    checkpoint.targetProfileId === plan.targetProfileId &&
    checkpoint.fingerprint === plan.preview.fingerprint;
  const read = async () => {
    if (await db.cloudState.get('link'))
      throw new Error('import_local_workspace_linked');
    const checkpoint = await state.get('import');
    if (checkpoint && !matches(checkpoint))
      throw new Error('import_review_changed');
    return checkpoint;
  };
  const checkpoint = await db.transaction('rw', state, async () => {
    const current = await read();
    if (current) return current;
    const initial: ImportCheckpoint = {
      key: 'import',
      accountId,
      targetProfileId: plan.targetProfileId,
      fingerprint: plan.preview.fingerprint,
      nextFile: 0,
      nextBatch: 0,
    };
    await state.add(initial);
    return initial;
  });
  const { nextFile, nextBatch } = checkpoint;
  const file = plan.files[nextFile];
  const batch = plan.batches[nextBatch];
  const next = { ...checkpoint };
  if (file) {
    const bytes = Uint8Array.from(atob(file.data), (character) =>
      character.charCodeAt(0),
    );
    await uploadAttachment(
      {
        id: file.id,
        mime: file.mime,
        createdAt: file.createdAt,
        data: new Blob([bytes], { type: file.mime }),
      },
      transport.files,
    );
    next.nextFile++;
  } else if (batch) {
    const response = await transport.sync.push(batch);
    const operations = new Map(
      response.changes.map((change) => [change.operationId, change]),
    );
    if (
      response.batchId !== batch.batchId ||
      response.changes.length !== batch.mutations.length ||
      batch.mutations.some((mutation) => {
        const change = operations.get(mutation.operationId);
        return (
          change?.type !== mutation.type ||
          change.id !== mutation.id ||
          change.revision !== 1
        );
      })
    )
      throw new Error('invalid_sync_receipt');
    next.nextBatch++;
  }
  const saved = await db.transaction('rw', state, async () => {
    const current = await read();
    if (!current) throw new Error('import_checkpoint_missing');
    if (current.nextFile !== nextFile || current.nextBatch !== nextBatch)
      return current;
    await state.put(next);
    return next;
  });
  return {
    files: saved.nextFile,
    batches: saved.nextBatch,
    done:
      saved.nextFile === plan.files.length &&
      saved.nextBatch === plan.batches.length,
  };
}

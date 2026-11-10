import { openDb } from '../db/schema';
import { loadCatalogRows } from '../seed/catalog-rows';
import { hydrateCatalogRecord } from './catalog';
import { isCatalogType } from './schema';
import { resolveConflict } from './resolve';
import { cloudEvaluationDate } from './workspace';

export interface WorkspaceConflict {
  type: string;
  id: string;
  revision: number;
  localHead?: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
}

export async function readWorkspaceConflicts(
  id: string,
  accountId: string,
  profileId: string,
) {
  const db = openDb(id);
  const conflicts = await db.transaction(
    'r',
    db.cloudState,
    db.cloudVersions,
    db.cloudOutbox,
    async () => {
      const link = await db.cloudState.get('link');
      if (
        !link ||
        link.locked ||
        link.accountId !== accountId ||
        link.profileId !== profileId
      )
        throw new Error('cloud_workspace_changed');
      const versions = await db.cloudVersions
        .filter((version) => Boolean(version.conflict))
        .toArray();
      const result: WorkspaceConflict[] = [];
      for (const version of versions) {
        const conflict = version.conflict!;
        const entry =
          version.localHead &&
          (await db.cloudOutbox
            .where('operationId')
            .equals(version.localHead)
            .first());
        if (!entry) continue;
        result.push({
          type: version.entityType,
          id: version.entityId,
          revision: conflict.revision,
          localHead: version.localHead,
          local:
            entry.kind === 'delete'
              ? {
                  ...entry.value,
                  deletedAt: new Date(entry.createdAt).toISOString(),
                }
              : entry.value,
          remote: conflict.payload,
        });
      }
      return result;
    },
  );
  for (const conflict of conflicts) {
    if (
      isCatalogType(conflict.type) &&
      Object.hasOwn(conflict.remote, 'catalogVersion')
    ) {
      conflict.remote = hydrateCatalogRecord(
        conflict.type,
        conflict.remote,
        await loadCatalogRows(),
      );
    }
  }
  return conflicts;
}

export async function chooseWorkspaceConflict(
  id: string,
  accountId: string,
  profileId: string,
  conflict: WorkspaceConflict,
  choice: 'local' | 'remote' | 'merge',
): Promise<void> {
  if (!navigator.locks) throw new Error('sync_browser_unsupported');
  await navigator.locks.request(
    `fitnessmy-sync:${id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error('sync_request_in_flight');
      await resolveConflict(
        openDb(id),
        accountId,
        profileId,
        conflict.type,
        conflict.id,
        conflict.revision,
        conflict.localHead,
        choice,
        cloudEvaluationDate(),
      );
    },
  );
}

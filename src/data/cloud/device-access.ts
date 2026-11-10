import { EXPORTABLE_TABLES, openDb, recoveryDb } from '../db/schema';
import { listProfiles, removeProfile } from '../profiles';
import { withoutCloudCapture } from './outbox';
import {
  CLOUD_LOGOUT_EVENT,
  readCloudSession,
  withCloudAccountLock,
} from './workspace';

export type DeviceWorkspace = {
  id: string;
  accountId: string;
  profileId: string;
};
const trustKey = 'offlineAccess';

export async function hasOfflineAccess({
  id,
  accountId,
  profileId,
}: DeviceWorkspace): Promise<boolean> {
  const db = openDb(id);
  return db.transaction('r', db.cloudState, async () => {
    const link = await db.cloudState.get('link');
    const state = db.table('cloudState');
    return Boolean(
      link &&
      !link.locked &&
      link.accountId === accountId &&
      link.profileId === profileId &&
      (await state.get('initialHydration')) &&
      (await state.get(trustKey)),
    );
  });
}

export async function setOfflineAccess(
  { id, accountId, profileId }: DeviceWorkspace,
  enabled: boolean,
) {
  if (enabled) {
    const session = await readCloudSession();
    if (!session?.syncEnabled || session.accountId !== accountId)
      throw new Error('cloud_sign_in_required');
  }
  const db = openDb(id);
  await db.transaction('rw', db.cloudState, async () => {
    const link = await db.cloudState.get('link');
    if (
      !link ||
      link.accountId !== accountId ||
      link.profileId !== profileId ||
      link.locked
    )
      throw new Error('cloud_workspace_changed');
    const state = db.table('cloudState');
    if (enabled) {
      if (!(await state.get('initialHydration')))
        throw new Error('cloud_download_pending');
      await state.put({ key: trustKey });
    } else {
      await state.delete(trustKey);
    }
  });
}

async function revokeSession() {
  const response = await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('cloud_logout_failed');
}

/** Block logout while any workspace has unsent edits. Keep all cloud records on the server. */
export async function logoutCloudAccount(accountId: string | null) {
  if (!accountId) {
    await revokeSession();
    return;
  }
  await withCloudAccountLock(accountId, async () => {
    const profiles = listProfiles().filter(
      (profile) => profile.cloud?.accountId === accountId,
    );
    const locked: string[] = [];
    let revoked = false;
    let logoutStarted = false;
    try {
      for (const { id, cloud } of profiles) {
        const db = openDb(id);
        await db.transaction('rw', db.cloudState, db.cloudOutbox, async () => {
          const link = await db.cloudState.get('link');
          if (
            !link ||
            link.accountId !== accountId ||
            link.profileId !== cloud?.profileId
          )
            throw new Error('cloud_workspace_changed');
          if (
            (await db.cloudOutbox.count()) ||
            (await db.table('cloudState').get('push'))
          )
            throw new Error('cloud_logout_pending');
          await db.cloudState.put({ ...link, locked: true });
        });
        locked.push(id);
      }
      localStorage.setItem(
        CLOUD_LOGOUT_EVENT,
        JSON.stringify({ accountId, nonce: crypto.randomUUID() }),
      );
      logoutStarted = true;
      await revokeSession();
      revoked = true;
      for (const id of locked) {
        const db = openDb(id);
        const stores = [
          ...EXPORTABLE_TABLES,
          'blobs',
          'cloudVersions',
          'cloudState',
        ];
        await withoutCloudCapture(db, stores, async () => {
          const link = await db.cloudState.get('link');
          if (!link?.locked || link.accountId !== accountId)
            throw new Error('cloud_workspace_changed');
          for (const name of stores) await db.table(name).clear();
          // Keep stale tabs from writing to the cleared workspace.
          await db.cloudState.add(link);
        });
        await recoveryDb.snapshots.delete(id);
        localStorage.removeItem(`lenta.backupSnoozeUntil.${id}`);
        removeProfile(id);
      }
    } finally {
      if (!revoked) {
        for (const id of locked) {
          const db = openDb(id);
          await db.transaction('rw', db.cloudState, async () => {
            if (logoutStarted) await db.cloudState.delete(trustKey);
            await db.cloudState.update('link', { locked: false });
          });
        }
      }
    }
  });
}

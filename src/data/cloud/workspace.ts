import { registerCloudProfile } from '../profiles';
import { EXPORTABLE_TABLES, openDb, type LentaDB } from '../db/schema';
import { createSyncTransport } from './transport';
import { createFileTransport } from './attachments';
import { syncOnce } from './sync-once';
import type { ProgressMetadata } from './progress-wire';
import { withoutCloudCapture } from './outbox';
import { liveQuery } from 'dexie';

export interface OwnedCloudProfile {
  id: string;
  name: string;
  tint: 'a' | 'b';
  createdAt: number;
}

export interface CloudSession {
  accountId: string;
  syncEnabled: boolean;
}
export const CLOUD_LOGOUT_EVENT = 'lenta.cloudLogout';

export async function withCloudAccountLock<T>(
  accountId: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks) throw new Error('sync_browser_unsupported');
  return await navigator.locks.request(`fitnessmy-account:${accountId}`, work);
}

export async function readCloudSession(
  signal?: AbortSignal,
): Promise<CloudSession | null> {
  const response = await request('/api/session', { signal });
  if (response.status === 401) return null;
  const data = await requireJson(response);
  if (
    data.authenticated !== true ||
    typeof data.accountId !== 'string' ||
    !data.accountId
  )
    throw new Error('invalid_cloud_session');
  return { accountId: data.accountId, syncEnabled: data.syncEnabled === true };
}

function request(path: string, options: RequestInit = {}) {
  return fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15000),
  });
}

async function requireJson(
  response: Response,
): Promise<Record<string, unknown>> {
  if (
    !response.ok ||
    response.headers.get('Content-Type')?.split(';')[0] !== 'application/json'
  )
    throw new Error('cloud_profile_request_failed');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_cloud_profile_response');
  return value as Record<string, unknown>;
}

function ownedProfile(value: unknown): OwnedCloudProfile {
  if (!value || typeof value !== 'object')
    throw new Error('invalid_cloud_profile');
  const { id, name, tint, createdAt } = value as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
    typeof name !== 'string' ||
    name.length > 80 ||
    !name.trim() ||
    (tint !== 'a' && tint !== 'b') ||
    typeof createdAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    !Number.isFinite(new Date(createdAt * 1000).getTime())
  )
    throw new Error('invalid_cloud_profile');
  return { id, name, tint, createdAt };
}

export async function listOwnedProfiles(
  signal: AbortSignal,
): Promise<OwnedCloudProfile[]> {
  const data = await requireJson(await request('/api/profiles', { signal }));
  if (!Array.isArray(data.profiles) || data.profiles.length > 100)
    throw new Error('invalid_cloud_profile_response');
  return data.profiles.map(ownedProfile);
}

export async function createOwnedProfile(
  id: string,
  name: string,
): Promise<OwnedCloudProfile> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id))
    throw new Error('invalid_cloud_profile');
  const data = await requireJson(
    await request(`/api/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tint: 'a', expectedRevision: 0 }),
    }),
  );
  const profile = ownedProfile(data.profile);
  if (profile.id !== id) throw new Error('invalid_cloud_profile');
  return profile;
}

export async function attachEmptyWorkspace(
  db: LentaDB,
  accountId: string,
  profileId: string,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      ...EXPORTABLE_TABLES,
      'blobs',
      'cloudState',
      'cloudOutbox',
      'cloudVersions',
    ],
    async () => {
      const link = await db.cloudState.get('link');
      if (link) {
        if (
          link.accountId !== accountId ||
          link.profileId !== profileId ||
          link.locked
        )
          throw new Error('cloud_workspace_changed');
        return;
      }
      for (const name of [
        ...EXPORTABLE_TABLES,
        'blobs',
        'cloudState',
        'cloudOutbox',
        'cloudVersions',
      ])
        if (await db.table(name).count())
          throw new Error('cloud_workspace_not_empty');
      await db.cloudState.add({
        key: 'link',
        accountId,
        profileId,
        locked: false,
      });
      await db
        .table<ProgressMetadata, string>('cloudState')
        .add({ key: 'progress', baselines: [] });
    },
  );
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Moscow',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function cloudEvaluationDate(now = new Date()): string {
  const parts = dateFormatter.formatToParts(now);
  return ['year', 'month', 'day']
    .map((field) => parts.find((part) => part.type === field)!.value)
    .join('-');
}

export function syncOwnedWorkspace(
  id: string,
  accountId: string,
  profileId: string,
) {
  if (!navigator.locks) throw new Error('sync_browser_unsupported');
  return navigator.locks.request(
    `fitnessmy-sync:${id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) return null;
      const db = openDb(id);
      const result = await syncOnce(
        db,
        accountId,
        profileId,
        createSyncTransport(profileId),
        createFileTransport(profileId),
        cloudEvaluationDate(),
      );
      return { ...result, pending: await db.cloudOutbox.count() };
    },
  );
}

export function watchPendingCloudChanges(
  id: string,
  onPending: () => void,
): () => void {
  const db = openDb(id);
  const subscription = liveQuery(() => db.cloudOutbox.count()).subscribe({
    next: (pending) => {
      if (pending > 0) onPending();
    },
    error: () => {
      /* The regular cycle reports storage failures. */
    },
  });
  return () => subscription.unsubscribe();
}

export async function openOwnedWorkspace(
  accountId: string,
  profile: OwnedCloudProfile,
): Promise<string> {
  return withCloudAccountLock(accountId, async () => {
    const session = await readCloudSession();
    if (!session?.syncEnabled || session.accountId !== accountId)
      throw new Error('cloud_sign_in_required');
    return openVerifiedWorkspace(accountId, profile);
  });
}

async function openVerifiedWorkspace(
  accountId: string,
  profile: OwnedCloudProfile,
): Promise<string> {
  const id = `cloud:${accountId}:${profile.id}`;
  const db = openDb(id);
  // Only a fresh server session and the account lock can recover an interrupted logout.
  await db.transaction('rw', db.cloudState, async () => {
    const link = await db.cloudState.get('link');
    if (
      link?.locked &&
      link.accountId === accountId &&
      link.profileId === profile.id
    ) {
      await db.cloudState.delete('offlineAccess');
      await db.cloudState.put({ ...link, locked: false });
      const state = db.table('cloudState');
      if (!(await state.get('progress')))
        await state.add({ key: 'progress', baselines: [] });
    }
  });
  await attachEmptyWorkspace(db, accountId, profile.id);
  const state = db.table<{ key: string }, string>('cloudState');
  if (!(await state.get('initialHydration'))) {
    const result = await syncOwnedWorkspace(id, accountId, profile.id);
    if (!result?.pullComplete) throw new Error('cloud_download_pending');
    await withoutCloudCapture(
      db,
      ['profile', 'settings', 'cloudState'],
      async () => {
        if (await db.profile.filter((row) => !row.deletedAt).count())
          await db.settings.update('singleton', { onboardingDone: true });
        await state.put({ key: 'initialHydration' });
      },
    );
  }
  registerCloudProfile({
    id,
    name: profile.name,
    tint: profile.tint,
    createdAt: new Date(profile.createdAt * 1000).toISOString(),
    cloud: { accountId, profileId: profile.id },
  });
  return id;
}

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system/primitives';
import type { ProfileRef } from '@/data/profiles';
import {
  CLOUD_LOGOUT_EVENT,
  readCloudSession,
  syncOwnedWorkspace,
  watchPendingCloudChanges,
} from '@/data/cloud/workspace';
import { SyncRequestError } from '@/data/cloud/transport';
import { useSession } from '@/app/store';

type Status =
  | 'connecting'
  | 'synced'
  | 'syncPending'
  | 'syncOffline'
  | 'syncError'
  | 'syncConflict'
  | 'reauthenticate';

export function CloudWorkspaceGate({
  id,
  accountId,
  profileId,
  children,
}: NonNullable<ProfileRef['cloud']> & { id: string; children: ReactNode }) {
  const { t } = useTranslation();
  const leave = useSession((state) => state.leave);
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<Status>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let failures = 0;
    let delay = 30_000;
    let retryAt = 0;
    const run = async () => {
      if (controller.signal.aborted || running || document.hidden) return;
      if (Date.now() < retryAt) {
        clearTimeout(timer);
        timer = setTimeout(() => void run(), retryAt - Date.now());
        return;
      }
      clearTimeout(timer);
      running = true;
      try {
        if (!navigator.onLine) {
          setStatus('syncOffline');
          return;
        }
        const session = await readCloudSession(
          AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        );
        if (controller.signal.aborted) return;
        if (!session || session.accountId !== accountId) {
          setOpened(false);
          setStatus('reauthenticate');
          return;
        }
        if (!session.syncEnabled) {
          setOpened(false);
          setStatus('syncError');
          return;
        }
        setOpened(true);
        const result = await syncOwnedWorkspace(id, accountId, profileId);
        if (controller.signal.aborted) return;
        const pending = !result || !result.pullComplete || result.pending > 0;
        setStatus(pending ? 'syncPending' : 'synced');
        failures = 0;
        retryAt = 0;
        delay = pending ? 3_000 : 30_000;
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof SyncRequestError && error.status === 401) {
          setOpened(false);
          setStatus('reauthenticate');
          return;
        }
        const conflict =
          (error instanceof SyncRequestError && error.status === 409) ||
          (error instanceof Error && error.message === 'sync_conflict_pending');
        setStatus(conflict ? 'syncConflict' : 'syncError');
        failures++;
        delay = Math.max(
          Math.min(300_000, 15_000 * 2 ** Math.min(failures - 1, 5)),
          error instanceof SyncRequestError ? error.retryAfter * 1000 : 0,
        );
        if (error instanceof SyncRequestError && error.retryAfter > 0)
          retryAt = Date.now() + delay;
      } finally {
        running = false;
        if (!controller.signal.aborted && !document.hidden)
          timer = setTimeout(() => void run(), delay);
      }
    };
    const wake = () => {
      void run();
    };
    const offline = () => setStatus('syncOffline');
    const signedOut = (event: StorageEvent) => {
      if (event.key !== CLOUD_LOGOUT_EVENT) return;
      controller.abort();
      clearTimeout(timer);
      setOpened(false);
      setStatus('reauthenticate');
    };
    const stopWatching = watchPendingCloudChanges(id, wake);
    wake();
    window.addEventListener('online', wake);
    window.addEventListener('offline', offline);
    window.addEventListener('storage', signedOut);
    document.addEventListener('visibilitychange', wake);
    return () => {
      controller.abort();
      stopWatching();
      clearTimeout(timer);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', offline);
      window.removeEventListener('storage', signedOut);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [id, accountId, profileId, attempt]);

  if (!opened)
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-6">
        <p role="status" className="text-caption">
          {t(`cloud.${status}`)}
        </p>
        {status === 'reauthenticate' && (
          <Button
            full
            variant="primary"
            onClick={() => window.location.assign('/auth/login')}
          >
            {t('cloud.signIn')}
          </Button>
        )}
        {status === 'syncError' && (
          <Button full onClick={() => setAttempt((value) => value + 1)}>
            {t('cloud.retry')}
          </Button>
        )}
        <Button full variant="ghost" onClick={leave}>
          {t('common.back')}
        </Button>
      </main>
    );
  return (
    <>
      <aside className="mx-auto flex max-w-screen-lg items-center justify-between gap-2 px-4 py-1 text-caption text-muted">
        <span role="status">{t(`cloud.${status}`)}</span>
        {status === 'syncError' && (
          <Button onClick={() => setAttempt((value) => value + 1)}>
            {t('cloud.retry')}
          </Button>
        )}
      </aside>
      {children}
    </>
  );
}

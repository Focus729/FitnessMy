import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system/primitives';
import { CloudProfiles } from './CloudProfiles';
import { logoutCloudAccount } from '@/data/cloud/device-access';
import { useSession } from '@/app/store';

type AccountState = 'loading' | 'signedIn' | 'signedOut' | 'unavailable';

export function CloudAccount() {
  const { t } = useTranslation();
  const [state, setState] = useState<AccountState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState<'logoutError' | 'logoutPending'>();
  const [profileBusy, setProfileBusy] = useState(false);
  const [syncAccount, setSyncAccount] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const refresh = useSession((value) => value.refresh);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let alive = true;
    setState('loading');
    setSyncAccount(null);
    setAccountId(null);
    void fetch('/api/session', {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) return 'signedOut' as const;
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { authenticated?: boolean };
        if (data.authenticated !== true) throw new Error();
        if (alive && 'accountId' in data && typeof data.accountId === 'string')
          setAccountId(data.accountId);
        if (alive && 'syncEnabled' in data && data.syncEnabled === true &&
          'accountId' in data && typeof data.accountId === 'string')
          setSyncAccount(data.accountId);
        return 'signedIn' as const;
      })
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => {
        if (alive) setState('unavailable');
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const logout = async () => {
    setLeaving(true);
    setLogoutError(undefined);
    try {
      await logoutCloudAccount(accountId);
      refresh();
      setSyncAccount(null);
      setState('signedOut');
    } catch (error) {
      setLogoutError(error instanceof Error && error.message === 'cloud_logout_pending'
        ? 'logoutPending' : 'logoutError');
    } finally {
      setLeaving(false);
    }
  };
  return (
    <section
      className="card mt-6 w-full space-y-3 p-4"
      aria-label={t('cloud.title')}
    >
      <h2 className="text-section">{t('cloud.title')}</h2>
      <p className="text-caption text-muted" role="status">
        {t(`cloud.${state}`)}
      </p>
      {state === 'signedOut' && (
        <Button
          full
          variant="primary"
          onClick={() => window.location.assign('/auth/login')}
        >
          {t('cloud.signIn')}
        </Button>
      )}
      {state === 'signedIn' && (
        <>
          {syncAccount && <CloudProfiles accountId={syncAccount} onBusy={setProfileBusy} />}
          <Button full onClick={() => void logout()} disabled={leaving || profileBusy}>
            {t(leaving ? 'cloud.signingOut' : 'cloud.signOut')}
          </Button>
          {accountId && <p className="text-caption text-muted">{t('cloud.logoutCopyHint')}</p>}
        </>
      )}
      {state === 'unavailable' && (
        <Button full onClick={() => setAttempt((value) => value + 1)}>
          {t('cloud.retry')}
        </Button>
      )}
      {logoutError && (
        <p className="text-caption text-over" role="alert">
          {t(`cloud.${logoutError}`)}
        </p>
      )}
      <p className="text-caption text-muted">{t(syncAccount ? 'cloud.separateProfiles' : 'cloud.localNotice')}</p>
    </section>
  );
}

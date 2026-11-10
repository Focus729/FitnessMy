import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/design-system/primitives';
import {
  hasOfflineAccess,
  setOfflineAccess,
  type DeviceWorkspace,
} from '@/data/cloud/device-access';

export function CloudDeviceAccess({
  id,
  accountId,
  profileId,
}: DeviceWorkspace) {
  const { t } = useTranslation();
  const [trusted, setTrusted] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void hasOfflineAccess({ id, accountId, profileId }).then(
      (value) => {
        if (current) setTrusted(value);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [id, accountId, profileId]);

  async function toggle() {
    setFailed(false);
    setBusy(true);
    try {
      await setOfflineAccess({ id, accountId, profileId }, !trusted);
      setTrusted(!trusted);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={() => void toggle()}
        disabled={busy || trusted === undefined}
      >
        {t(
          trusted ? 'cloud.disableOfflineAccess' : 'cloud.enableOfflineAccess',
        )}
      </Button>
      <p className="text-caption text-muted">{t('cloud.offlineAccessHint')}</p>
      {failed && (
        <p role="alert" className="text-caption text-over">
          {t('cloud.offlineAccessError')}
        </p>
      )}
    </div>
  );
}

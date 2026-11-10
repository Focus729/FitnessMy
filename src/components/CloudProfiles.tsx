import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/app/store';
import { Button, TextField } from '@/design-system/primitives';
import {
  createOwnedProfile,
  listOwnedProfiles,
  openOwnedWorkspace,
  type OwnedCloudProfile,
} from '@/data/cloud/workspace';

export function CloudProfiles({
  accountId,
  onBusy,
}: {
  accountId: string;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useTranslation();
  const select = useSession((state) => state.select);
  const [profiles, setProfiles] = useState<OwnedCloudProfile[]>();
  const [listFailed, setListFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListFailed(false);
    void listOwnedProfiles(
      AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    )
      .then((rows) => {
        if (!controller.signal.aborted) setProfiles(rows);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListFailed(true);
      });
    return () => controller.abort();
  }, [accountId, reload]);

  async function open(profile?: OwnedCloudProfile) {
    if (busy || (!profile && !name.trim())) return;
    setBusy(true);
    onBusy(true);
    setFailed(false);
    try {
      if (!profile) {
        const trimmed = name.trim();
        if (pending.current?.name !== trimmed)
          pending.current = { id: crypto.randomUUID(), name: trimmed };
        profile = await createOwnedProfile(
          pending.current.id,
          pending.current.name,
        );
      }
      select(await openOwnedWorkspace(accountId, profile));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!profiles && !listFailed && (
        <p role="status" className="text-caption text-muted">
          {t('cloud.profilesLoading')}
        </p>
      )}
      {listFailed && (
        <div className="space-y-2">
          <p role="alert" className="text-caption text-over">
            {t('cloud.profilesError')}
          </p>
          <Button full onClick={() => setReload((value) => value + 1)}>
            {t('cloud.retry')}
          </Button>
        </div>
      )}
      {profiles && !listFailed && (
        <>
          <ul className="space-y-2">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <Button full disabled={busy} onClick={() => void open(profile)}>
                  <span className="min-w-0 break-words">{profile.name}</span>
                </Button>
              </li>
            ))}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void open();
            }}
          >
            <TextField
              aria-label={t('cloud.profileName')}
              placeholder={t('cloud.profileName')}
              value={name}
              onChange={setName}
              maxLength={80}
              disabled={busy}
            />
            <Button
              type="submit"
              variant="primary"
              full
              disabled={busy || !name.trim()}
            >
              {t('cloud.createProfile')}
            </Button>
          </form>
        </>
      )}
      {busy && (
        <p role="status" className="text-caption text-muted">
          {t('cloud.openingProfile')}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-caption text-over">
          {t('cloud.openProfileError')}
        </p>
      )}
    </div>
  );
}

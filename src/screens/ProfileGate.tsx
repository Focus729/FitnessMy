/**
 * Выбор профиля и PIN — разделы 2.1 и 16.1.
 *
 * Аутентификации нет. PIN защищает от случайного открытия чужого профиля
 * на общем ноутбуке и прямо об этом сообщает.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProfile, verifyPin, type ProfileRef } from '@/data/profiles';
import { useSession, applyTheme } from '@/app/store';
import { useOnline } from '@/app/hooks';
import { Button, TextField } from '@/design-system/primitives';
import { CloudAccount } from '@/components/CloudAccount';
import { hasOfflineAccess } from '@/data/cloud/device-access';

export function ProfileGate() {
  const { t } = useTranslation();
  const { profiles, activeProfileId, select, unlock, refresh, leave } = useSession();
  const online = useOnline();
  const [newName, setNewName] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    applyTheme('system');
  }, []);

  const pending = activeProfileId ? profiles.find((p) => p.id === activeProfileId) : undefined;
  const localProfiles = profiles.filter((profile) => !profile.cloud);

  if (pending?.pinHash) {
    const submit = async () => {
      const ok = await verifyPin(pending.id, String(pin));
      if (ok) unlock();
      else {
        setPinError(true);
        setPin('');
      }
    };
    return (
      <Centered>
        <h1 className="text-title">{t('profiles.pinTitle')}</h1>
        <p className="mt-1 text-caption text-muted">{pending.name}</p>
        <div className="mt-6 w-full">
          <TextField
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(v) => {
              setPin(v.replace(/\D/g, '').slice(0, 6));
              setPinError(false);
            }}
            autoFocus
            maxLength={6}
            aria-label={t('profiles.pinTitle')}
          />
        </div>
        {pinError ? <p className="mt-2 text-caption text-over">{t('profiles.pinWrong')}</p> : null}
        <div className="mt-6 flex w-full flex-col gap-2">
          <Button variant="primary" full onClick={() => void submit()}>
            {t('common.continue')}
          </Button>
          <Button variant="ghost" full onClick={leave}>
            {t('common.back')}
          </Button>
        </div>
        <p className="mt-6 text-caption text-muted">{t('profiles.pinDisclaimer')}</p>
      </Centered>
    );
  }

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const ref = createProfile(name);
    refresh();
    select(ref.id);
  };

  return (
    <Centered>
      <h1 className="text-title">{t('profiles.title')}</h1>
      <p className="mt-1 text-caption text-muted">{t('profiles.subtitle')}</p>
      {import.meta.env.VITE_CLOUD_ENABLED === 'true' &&
        (online ? (
          <CloudAccount />
        ) : (
          <OfflineCloudProfiles profiles={profiles} onSelect={select} />
        ))}

      <ul className="mt-6 w-full space-y-2">
        {localProfiles.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => select(p.id)}
              className="card flex min-h-touch w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-section">{p.name}</span>
              {p.pinHash ? (
                <span aria-hidden="true" className="text-muted">
                  ◍
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6 w-full space-y-2">
        <TextField
          value={newName}
          onChange={setNewName}
          placeholder={t('profiles.namePlaceholder')}
          aria-label={t('profiles.namePlaceholder')}
        />
        <div className="flex gap-2">
          <Button full onClick={add} disabled={!newName.trim()}>
            {t('profiles.create')}
          </Button>
        </div>
        {localProfiles.length === 0 ? (
          <div className="flex gap-2">
            <Button
              full
              variant="ghost"
              onClick={() => {
                setNewName(t('profiles.me'));
              }}
            >
              {t('profiles.me')}
            </Button>
            <Button
              full
              variant="ghost"
              onClick={() => {
                setNewName(t('profiles.spouse'));
              }}
            >
              {t('profiles.spouse')}
            </Button>
          </div>
        ) : null}
      </div>
    </Centered>
  );
}

function OfflineCloudProfiles({
  profiles,
  onSelect,
}: {
  profiles: ProfileRef[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [trusted, setTrusted] = useState<ProfileRef[] | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all(
      profiles.map(async (profile) => {
        const { id, cloud } = profile;
        if (!cloud) return null;
        const allowed = await hasOfflineAccess({ id, ...cloud }).catch(() => false);
        return allowed ? profile : null;
      }),
    ).then((matches) => {
      if (current) setTrusted(matches.filter((profile) => profile !== null));
    });
    return () => {
      current = false;
    };
  }, [profiles]);

  return (
    <section
      className="card mt-6 w-full space-y-3 p-4"
      aria-label={t('cloud.title')}
    >
      <h2 className="text-section">{t('cloud.title')}</h2>
      {trusted === null && (
        <p role="status" className="text-caption text-muted">
          {t('cloud.profilesLoading')}
        </p>
      )}
      {trusted?.length === 0 && (
        <p role="status" className="text-caption text-muted">
          {t('cloud.offlineAccessRequired')}
        </p>
      )}
      {!!trusted?.length && (
        <>
          <p className="text-caption text-muted">{t('cloud.offlineProfiles')}</p>
          <ul className="space-y-2">
            {trusted.map(({ id, name }) => (
              <li key={id}>
                <Button full onClick={() => onSelect(id)}>{name}</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 py-10">
      {children}
    </div>
  );
}

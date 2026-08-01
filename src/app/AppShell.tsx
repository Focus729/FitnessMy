/**
 * Оболочка: пять вкладок снизу (18.5), индикатор офлайна (19.1),
 * неблокирующая плашка обновления (19.1) и напоминание о копии (2.3).
 */
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOnline, useSettings, useUpdateSettings } from './hooks';
import { useRepos } from '@/data/repositories/context';
import { getProfileRef } from '@/data/profiles';
import { useSession } from './store';
import { applyUpdate, registerServiceWorker } from './sw';
import { BackupReminder } from '@/components/BackupReminder';
import { Button } from '@/design-system/primitives';
import { recomputeStreaks } from './streaks';
import { refreshAchievements } from './gamification';

const TABS = [
  { to: '/', key: 'nav.today', icon: '◐' },
  { to: '/food', key: 'nav.food', icon: '◍' },
  { to: '/gym', key: 'nav.gym', icon: '◼' },
  { to: '/body', key: 'nav.body', icon: '◇' },
  { to: '/progress', key: 'nav.progress', icon: '◈' },
] as const;

export function AppShell({ seeded }: { seeded: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const repos = useRepos();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const { activeProfileId } = useSession();
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  // Серии и достижения пересчитываются при запуске и при возврате на вкладку:
  // так ретроактивное заполнение сразу отражается в состоянии.
  useEffect(() => {
    if (!seeded) return;
    const refresh = () => {
      void recomputeStreaks(repos).then(() => refreshAchievements(repos));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [repos, seeded]);

  const profileName = activeProfileId ? (getProfileRef(activeProfileId)?.name ?? '') : '';
  const isToday = location.pathname === '/';

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      {!online ? (
        <div className="sticky top-0 z-30 bg-ink px-4 py-1 text-center text-caption text-paper">
          {t('common.offline')}
        </div>
      ) : null}

      <header className="flex items-center justify-between px-4 pb-1 pt-3">
        {/* Имя профиля всегда видно — раздел 23 */}
        <span className="text-label uppercase text-muted">{profileName}</span>
        {isToday ? (
          <button
            type="button"
            aria-label={t('nav.settings')}
            className="tappable justify-center text-muted"
            onClick={() => navigate('/settings')}
          >
            <span aria-hidden="true">⚙</span>
          </button>
        ) : null}
      </header>

      <main className="flex-1 px-4 pb-28">
        <Outlet />
      </main>

      {updateReady ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-lg items-center gap-3 px-4">
          <div className="card flex w-full items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-caption font-semibold">{t('update.available')}</div>
              <div className="text-caption text-muted">{t('update.hint')}</div>
            </div>
            <Button variant="primary" onClick={() => void applyUpdate()}>
              {t('update.action')}
            </Button>
          </div>
        </div>
      ) : null}

      <BackupReminder
        lastBackupAt={settings.sync.lastBackupAt}
        onDone={(at) => void updateSettings({ sync: { ...settings.sync, lastBackupAt: at } })}
      />

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`
                }
              >
                <span aria-hidden="true" className="text-[15px]">
                  {tab.icon}
                </span>
                {t(tab.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

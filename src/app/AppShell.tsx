/**
 * Оболочка: пять вкладок снизу (18.5), индикатор офлайна (19.1),
 * неблокирующая плашка обновления (19.1) и напоминание о копии (2.3).
 */
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOnline, useSettings, useUpdateSettings } from './hooks';
import { useRepos } from '@/data/repositories/context';
import { getProfileRef } from '@/data/profiles';
import { useSession } from './store';
import { applyUpdate, registerServiceWorker } from './sw';
import { BackupReminder } from '@/components/BackupReminder';
import { Button } from '@/design-system/primitives';
import { SectionIcon, type SectionIconName } from '@/design-system/icons';
import { recomputeStreaks } from './streaks';
import { refreshAchievements, refreshQuitMilestones } from './gamification';

const TABS = [
  { to: '/', key: 'nav.today', icon: 'today' },
  { to: '/food', key: 'nav.food', icon: 'food' },
  { to: '/gym', key: 'nav.gym', icon: 'gym' },
  { to: '/body', key: 'nav.body', icon: 'body' },
  { to: '/progress', key: 'nav.progress', icon: 'progress' },
] as const;

/** Иконка раздела в шапке — по текущему маршруту (задача 6, пункт 1). */
const HEADER_ICONS: Record<string, SectionIconName> = {
  '/': 'today',
  '/food': 'food',
  '/gym': 'gym',
  '/body': 'body',
  '/progress': 'progress',
  '/settings': 'settings',
};

export function AppShell({ seeded }: { seeded: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const repos = useRepos();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const { activeProfileId, leave } = useSession();
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = main.current?.animate?.([{ opacity: 0.72 }, { opacity: 1 }], {
      duration: 190,
      easing: 'ease-out',
    });
    return () => animation?.cancel();
  }, [location.pathname]);
  const routeKey = `lenta.tabRoutes.${activeProfileId}`;
  const [tabQueries, setTabQueries] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(routeKey) ?? '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (!TABS.some((tab) => tab.to === location.pathname)) return;
    setTabQueries((previous) => {
      const next = { ...previous, [location.pathname]: location.search };
      try {
        sessionStorage.setItem(routeKey, JSON.stringify(next));
      } catch {
        /* In-memory navigation still works. */
      }
      return next;
    });
  }, [location.pathname, location.search, routeKey]);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  // Серии и достижения пересчитываются при запуске и при возврате на вкладку:
  // так ретроактивное заполнение сразу отражается в состоянии.
  useEffect(() => {
    if (!seeded) return;
    const refresh = () => {
      void recomputeStreaks(repos)
        .then(() => refreshAchievements(repos))
        .then(() => refreshQuitMilestones(repos));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [repos, seeded]);

  const profileName = activeProfileId ? (getProfileRef(activeProfileId)?.name ?? '') : '';

  return (
    <div className="app-shell mx-auto flex min-h-dvh flex-col">
      {!online ? (
        <div className="sticky top-0 z-30 bg-ink px-4 py-1 text-center text-caption text-paper">
          {t('common.offline')}
        </div>
      ) : null}

      <header className="app-header flex items-center gap-2 px-4 pb-3 pt-5">
        <SectionIcon name={HEADER_ICONS[location.pathname] ?? 'today'} active />
        {/* Имя профиля всегда видно — раздел 23 */}
        <button
          type="button"
          className="tappable min-w-0 flex-1 gap-2 text-left text-label text-muted"
          onClick={leave}
          aria-label={`${t('profiles.switch')}: ${profileName}`}
        >
          <span className="min-w-0">
            <span className="app-wordmark">FitnessMy</span>
            <span className="block truncate">{profileName} <span aria-hidden="true">▾</span></span>
          </span>
        </button>
        {
          <button
            type="button"
            aria-label={t('nav.settings')}
            className="tappable justify-center text-muted"
            onClick={() => navigate('/settings')}
          >
            <SectionIcon name="settings" />
          </button>
        }
      </header>

      <main ref={main} className="app-main flex-1 px-4 pb-28">
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

      <nav className="app-nav fixed inset-x-0 bottom-0 z-30 mx-auto border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex-1">
              <NavLink
                to={`${tab.to}${typeof tabQueries[tab.to] === 'string' && tabQueries[tab.to]?.startsWith('?') ? tabQueries[tab.to] : ''}`}
                end={tab.to === '/'}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <SectionIcon name={tab.icon} active={isActive} />
                    <span>{t(tab.key)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

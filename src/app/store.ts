/**
 * Состояние сеанса: выбранный профиль, разблокировка PIN, тема.
 * Данные здесь НЕ хранятся — только то, что живёт до перезагрузки.
 */
import { create } from 'zustand';
import {
  getActiveProfileId,
  getProfileRef,
  listProfiles,
  setActiveProfile,
  type ProfileRef,
} from '@/data/profiles';

interface SessionState {
  profiles: ProfileRef[];
  activeProfileId: string | null;
  unlocked: boolean;
  refresh: () => void;
  select: (id: string) => void;
  unlock: () => void;
  leave: () => void;
}

/**
 * Профиль без PIN разблокирован сразу: перезапуск приложения не должен
 * требовать повторного выбора. PIN, если он задан, спрашивается всегда (2.1).
 */
function isUnlockedByDefault(profileId: string | null): boolean {
  if (!profileId) return false;
  return !getProfileRef(profileId)?.pinHash;
}

export const useSession = create<SessionState>((set) => ({
  profiles: listProfiles(),
  activeProfileId: getActiveProfileId(),
  unlocked: isUnlockedByDefault(getActiveProfileId()),
  refresh: () =>
    set({
      profiles: listProfiles(),
      activeProfileId: getActiveProfileId(),
    }),
  select: (id) => {
    setActiveProfile(id);
    const ref = getProfileRef(id);
    set({ activeProfileId: id, unlocked: !ref?.pinHash, profiles: listProfiles() });
  },
  unlock: () => set({ unlocked: true }),
  leave: () => set({ unlocked: false, activeProfileId: null }),
}));

/** Применяет тему и оттенок профиля к корню документа (18.2, раздел 23). */
export function applyTheme(theme: 'light' | 'dark' | 'system', tint: 'a' | 'b' = 'a'): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-profile-tint', tint);
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', dark ? '#0E1013' : '#F5F6F8'));
}

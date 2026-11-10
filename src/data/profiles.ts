/**
 * Реестр профилей — разделы 2.1 и 16.1.
 *
 * Аутентификации нет. Профили полностью изолированы: у каждого своя база Dexie.
 * Реестр лежит в localStorage и не содержит персональных данных, кроме имени
 * (правило 5.4).
 *
 * PIN — защита от случайного открытия чужого профиля на общем ноутбуке,
 * НЕ шифрование. Это честно написано в интерфейсе (2.1).
 */
import { uuid } from '@/lib/id';
import { deleteDb, recoveryDb } from '@/data/db/schema';

const REGISTRY_KEY = 'lenta.profiles.v1';
const ACTIVE_KEY = 'lenta.activeProfile.v1';

export interface ProfileRef {
  id: string;
  name: string;
  /** Оттенок акцента, чтобы два профиля не путались (раздел 23). */
  tint: 'a' | 'b';
  pinHash?: string;
  createdAt: string;
  cloud?: { accountId: string; profileId: string };
}

export function listProfiles(): ProfileRef[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProfileRef[]) : [];
  } catch {
    return [];
  }
}

function save(list: ProfileRef[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
}

export function createProfile(name: string): ProfileRef {
  const list = listProfiles();
  const ref: ProfileRef = {
    id: uuid(),
    name,
    tint: list.length % 2 === 0 ? 'a' : 'b',
    createdAt: new Date().toISOString(),
  };
  save([...list, ref]);
  return ref;
}

/** Register a separate device workspace for an owned cloud profile. */
export function registerCloudProfile(ref: ProfileRef & { cloud: NonNullable<ProfileRef['cloud']> }): void {
  const list = listProfiles();
  const previous = list.find((profile) => profile.id === ref.id);
  if (previous && (
    previous.cloud?.accountId !== ref.cloud.accountId ||
    previous.cloud.profileId !== ref.cloud.profileId
  )) throw new Error('cloud_workspace_changed');
  save(previous
    ? list.map((profile) => profile.id === ref.id ? { ...previous, ...ref } : profile)
    : [...list, ref]);
}

export function renameProfile(id: string, name: string): void {
  save(listProfiles().map((p) => (p.id === id ? { ...p, name } : p)));
}

export function removeProfile(id: string): void {
  save(listProfiles().filter((p) => p.id !== id));
  if (getActiveProfileId() === id) clearActiveProfile();
}

/**
 * Полное удаление профиля: база и запись в реестре (16.1, 19.4).
 * Живёт в слое data — интерфейсу схема Dexie недоступна (правило 2.9).
 */
export async function destroyProfile(id: string): Promise<void> {
  if (getProfileRef(id)?.cloud) throw new Error('cloud_profile_delete_unavailable');
  await deleteDb(id);
  await recoveryDb.snapshots.delete(id);
  localStorage.removeItem(`lenta.backupSnoozeUntil.${id}`);
  removeProfile(id);
}

export function getActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function clearActiveProfile(): void {
  localStorage.removeItem(ACTIVE_KEY);
}

export function getProfileRef(id: string): ProfileRef | undefined {
  return listProfiles().find((p) => p.id === id);
}

/* ────────────────────────────────── PIN ────────────────────────────────────── */

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`lenta.pin.${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(id: string, pin: string | null): Promise<void> {
  const hash = pin ? await hashPin(pin) : undefined;
  save(
    listProfiles().map((p) => {
      if (p.id !== id) return p;
      const next = { ...p };
      if (hash) next.pinHash = hash;
      else delete next.pinHash;
      return next;
    }),
  );
}

export async function verifyPin(id: string, pin: string): Promise<boolean> {
  const ref = getProfileRef(id);
  if (!ref?.pinHash) return true;
  return (await hashPin(pin)) === ref.pinHash;
}

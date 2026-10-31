import { useState, type Dispatch, type SetStateAction } from 'react';
import { useRepos } from '@/data/repositories/context';

/** Transient form drafts are isolated by profile and date, never included in backups. */
export function useSessionDraft<T>(
  scope: string,
  field: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { profileId } = useRepos();
  const key = `lenta.draft.${profileId}.${scope}.${field}`;
  const [value, update] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      const parsed: unknown = saved == null ? initial : JSON.parse(saved);
      return typeof parsed === typeof initial ||
        (initial === '' && typeof parsed === 'number' && Number.isFinite(parsed))
        ? (parsed as T)
        : initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (next) =>
      update((previous) => {
        const resolved = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
        try {
          sessionStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* Keep the in-memory draft. */
        }
        return resolved;
      }),
  ];
}

export function clearSessionDraft(profileId: string, scope: string): void {
  try {
    const prefix = `lenta.draft.${profileId}.${scope}.`;
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {
    /* Storage denial must not turn a successful database save into a retry. */
  }
}

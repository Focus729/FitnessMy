/**
 * Реактивные хуки поверх репозиториев.
 *
 * dexie-react-hooks импортируется только здесь: UI видит обычные хуки,
 * не зная, что под ними IndexedDB.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepos } from './context';
import type { Repositories } from './types';

/**
 * Подписка на запрос. Возвращает undefined, пока данные грузятся —
 * это отличает «ещё не знаем» от «пусто».
 */
export function useQuery<T>(
  querier: (repos: Repositories) => Promise<T>,
  deps: unknown[] = [],
): T | undefined {
  const repos = useRepos();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useLiveQuery(() => querier(repos), [repos.profileId, ...deps]);
}

/** То же, но с гарантированным значением по умолчанию. */
export function useQueryWithDefault<T>(
  querier: (repos: Repositories) => Promise<T>,
  fallback: T,
  deps: unknown[] = [],
): T {
  return useQuery(querier, deps) ?? fallback;
}

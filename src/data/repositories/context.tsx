/**
 * Единственная точка, через которую интерфейс получает данные.
 *
 * Компоненты используют useRepos() и хуки из ./hooks; импорт Dexie в UI
 * запрещён правилом ESLint (решение 2.9).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createRepositories } from './dexie';
import type { Repositories } from './types';

const RepoContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({
  profileId,
  children,
}: {
  profileId: string;
  children: ReactNode;
}) {
  const repos = useMemo(() => createRepositories(profileId), [profileId]);
  return <RepoContext.Provider value={repos}>{children}</RepoContext.Provider>;
}

export function useRepos(): Repositories {
  const repos = useContext(RepoContext);
  if (!repos) throw new Error('RepositoriesProvider is missing');
  return repos;
}

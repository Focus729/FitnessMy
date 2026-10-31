import { useSearchParams } from 'react-router-dom';

function validRouteDate(value: string | null): boolean {
  return (
    value != null &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

/** Shareable subview/date state; Back restores the previous selection. */
export function useRouteState<T extends string>(
  key: string,
  fallback: T,
  allowed?: readonly T[],
): [T, (value: T | ((previous: T) => T)) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key) as T | null;
  const isDate = key === 'date' || key === 'week';
  const validDate = !isDate || validRouteDate(raw);
  const value = raw && validDate && (!allowed || allowed.includes(raw)) ? raw : fallback;
  return [
    value,
    (next) =>
      setParams((previous) => {
        const updated = new URLSearchParams(previous);
        const current = previous.get(key) as T | null;
        updated.set(
          key,
          typeof next === 'function'
            ? next(
                current &&
                  (!isDate || validRouteDate(current)) &&
                  (!allowed || allowed.includes(current))
                  ? current
                  : fallback,
              )
            : next,
        );
        return updated;
      }),
  ];
}

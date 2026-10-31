import { useRef, useState } from 'react';

/** Retain drafts in callers, reject repeated submissions, and expose write errors. */
export function useSaveAction() {
  const lock = useRef(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setState('saving');
    try {
      await action();
      setState('saved');
    } catch {
      setState('error');
    } finally {
      lock.current = false;
    }
  };
  return { state, run, busy: state === 'saving' };
}

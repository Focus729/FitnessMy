/**
 * Регистрация Service Worker — раздел 19.1.
 *
 * Новая версия активируется ТОЛЬКО по явному нажатию «Обновить»:
 * обновление посреди тренировки недопустимо.
 */
import { registerSW } from 'virtual:pwa-register';

let updateFn: ((reload?: boolean) => Promise<void>) | null = null;

export function registerServiceWorker(onNeedRefresh: () => void): void {
  if (import.meta.env.DEV) return;
  updateFn = registerSW({
    immediate: true,
    onNeedRefresh,
  });
}

export async function applyUpdate(): Promise<void> {
  await updateFn?.(true);
}

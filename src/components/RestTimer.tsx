/**
 * Таймер отдыха — раздел 10.1 (C2-б).
 * Крупно, вверху экрана, поверх контента. −15/+15 секунд и «Пропустить».
 * По умолчанию — вибрация без звука.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { durationShort } from '@/lib/format';

export function RestTimer({
  seconds,
  vibrate,
  sound,
  onClose,
}: {
  seconds: number;
  vibrate: boolean;
  sound: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(seconds);
  const finished = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((v) => v - 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (left > 0 || finished.current) return;
    finished.current = true;
    if (vibrate && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 80, 120]);
    if (sound) beep();
    const id = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(id);
  }, [left, vibrate, sound, onClose]);

  return (
    <div className="fixed inset-x-0 top-0 z-40 mx-auto flex max-w-lg items-center gap-2 border-b border-hairline bg-surface px-4 py-2">
      <span className="text-label uppercase text-muted">{t('gym.restTimer')}</span>
      <span className="tnum flex-1 text-[28px] leading-none font-medium">
        {left > 0 ? durationShort(left) : t('gym.restDone')}
      </span>
      <button
        type="button"
        className="tappable justify-center rounded-lg border border-hairline px-2 text-caption"
        onClick={() => setLeft((v) => Math.max(0, v - 15))}
      >
        {t('gym.restMinus')}
      </button>
      <button
        type="button"
        className="tappable justify-center rounded-lg border border-hairline px-2 text-caption"
        onClick={() => setLeft((v) => v + 15)}
      >
        {t('gym.restPlus')}
      </button>
      <button type="button" className="tappable justify-center px-2 text-caption text-accent" onClick={onClose}>
        {t('gym.restSkip')}
      </button>
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    /* звук не критичен */
  }
}

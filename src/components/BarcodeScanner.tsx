/**
 * Сканер штрихкода — раздел 9.2 (S3, цель 10 секунд).
 *
 * Нативный BarcodeDetector там, где он есть; ZXing — везде остальное.
 * ZXing подгружается динамически: он не нужен большинству запусков и не должен
 * лежать в основном бандле (19.2).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, TextField } from '@/design-system/primitives';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<'denied' | 'unsupported' | null>(null);
  const [manual, setManual] = useState('');
  const detected = useRef(onDetected);
  detected.current = onDetected;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let raf = 0;
    let zxingControls: { stop: () => void } | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        setError('denied');
        return;
      }
      const video = videoRef.current;
      if (!video || stopped) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: FORMATS });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            const code = found[0]?.rawValue;
            if (code) {
              stopped = true;
              detected.current(code);
              return;
            }
          } catch {
            /* кадр не разобрался — просто пробуем следующий */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
        return;
      }

      // Откат на ZXing — загружается только здесь.
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromVideoElement(video, (result) => {
          if (result && !stopped) {
            stopped = true;
            detected.current(result.getText());
          }
        });
      } catch {
        setError('unsupported');
      }
    };

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (error) {
    return (
      <div>
        <p className="text-body text-muted">
          {error === 'denied' ? t('errors.cameraDenied') : t('food.barcodeNoCamera')}
        </p>
        <div className="mt-3 flex gap-2">
          <TextField
            value={manual}
            onChange={(value) => setManual(value.replace(/\D/g, '').slice(0, 32))}
            inputMode="numeric"
            aria-label={t('food.barcodeManual')}
            className="flex-1"
          />
          <Button variant="primary" disabled={manual === ''} onClick={() => onDetected(manual)}>
            {t('common.search')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl bg-ink">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-56 w-full object-cover"
          aria-label={t('food.barcodeTitle')}
        />
      </div>
      <p className="mt-2 text-caption text-muted">{t('food.barcodeHint')}</p>
    </div>
  );
}

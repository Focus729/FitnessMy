/**
 * Выезжающая снизу панель — раздел 18.5 ТЗ и задача 5 доработки 0.7.
 *
 * Все диалоги ввода в приложении — только такие панели, не модальные окна
 * по центру.
 *
 * Закрыть панель можно четырьмя способами, и все четыре обязательны:
 *   • кнопка закрытия в правом верхнем углу (область 44×44);
 *   • тап по затемнённому фону;
 *   • свайп вниз по «ручке» или шапке;
 *   • клавиша Esc.
 *
 * Защита от потери ввода:
 *   • если пользователь ничего не менял (`dirty` не выставлен) — закрываем
 *     молча. Диалог «Точно выйти?» на пустой форме — ровно та проблема,
 *     ради которой писалась эта задача;
 *   • если менял — показываем не модальное окно, а нижнюю панель с тремя
 *     вариантами: сохранить, не сохранять, продолжить ввод.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/** Порог свайпа вниз, после которого панель закрывается. */
const SWIPE_CLOSE_PX = 90;
const openDialogs: HTMLElement[] = [];

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Пользователь изменил хотя бы одно поле относительно начального состояния.
   * Автоподставленные значения (вес из истории, число повторов по умолчанию)
   * вводом НЕ считаются — это условие задаёт вызывающий экран.
   */
  dirty?: boolean;
  /** Сохранить и закрыть. Нужен, только если используется `dirty`. */
  onSave?: () => void;
}

export function Sheet({ open, onClose, title, children, footer, dirty, onSave }: SheetProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /** Единая точка выхода: молча либо через панель выбора. */
  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    openDialogs.push(element);
    const root = document.getElementById('root');
    if (root) root.inert = true;
    const initialScope = confirming
      ? element.parentElement?.querySelector<HTMLElement>('[data-close-choice]')
      : element;
    if (confirming) {
      initialScope?.querySelector<HTMLElement>('button')?.focus();
      element.inert = true;
    } else if (!element.contains(document.activeElement)) element.focus();
    const onKey = (e: KeyboardEvent) => {
      if (openDialogs.at(-1) !== element) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (confirming) setConfirming(false);
        else closeRef.current();
      }
      if (e.key === 'Tab') {
        const scope = confirming
          ? element.parentElement?.querySelector('[data-close-choice]')
          : element;
        const controls = Array.from(
          scope?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex="0"]',
          ) ?? [],
        ).filter((node) => node.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
          e.preventDefault();
          element.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first || !scope?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || !scope?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      element.inert = false;
      const index = openDialogs.indexOf(element);
      if (index >= 0) openDialogs.splice(index, 1);
      if (!openDialogs.length) {
        document.body.style.overflow = '';
        if (root) root.inert = false;
      }
      if (previous?.isConnected) previous.focus();
    };
  }, [open, confirming]);

  // Сбрасываем состояние, когда панель закрылась снаружи.
  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setDragY(0);
    }
  }, [open]);

  if (!open) return null;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = e.clientY;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current == null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const shouldClose = dragY > SWIPE_CLOSE_PX;
    dragStart.current = null;
    setDragY(0);
    if (shouldClose) requestClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-ink/30 animate-fadeIn"
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : t('common.edit')}
        className="sheet-panel relative max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-surface shadow-sheet animate-sheetIn"
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        <div
          className="sticky top-0 z-10 touch-none bg-surface px-4 pb-2 pt-3"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragY(0);
          }}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline" />
          <div className="flex items-start gap-2">
            {title ? (
              <h2 id={titleId} className="min-w-0 flex-1 text-section">
                {title}
              </h2>
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={requestClose}
              className="-mr-2 -mt-2 flex h-touch w-touch shrink-0 items-center justify-center rounded-full text-muted"
            >
              <span aria-hidden="true" className="text-[18px] leading-none">
                ✕
              </span>
            </button>
          </div>
        </div>

        <div className="px-4 pb-4">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-hairline bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : null}
      </div>

      {confirming ? (
        <CloseChoice
          canSave={Boolean(onSave)}
          onSave={() => {
            setConfirming(false);
            onSave?.();
          }}
          onDiscard={() => {
            setConfirming(false);
            onClose();
          }}
          onContinue={() => setConfirming(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** Нижняя панель выбора вместо модального «Вы уверены?». */
function CloseChoice({
  canSave,
  onSave,
  onDiscard,
  onContinue,
}: {
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onContinue} aria-hidden="true" />
      <div
        data-close-choice
        role="dialog"
        aria-label={t('sheet.unsavedTitle')}
        aria-modal="true"
        className="relative rounded-t-2xl border-t border-hairline bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-sheet animate-sheetIn"
      >
        <p className="text-body">{t('sheet.unsavedTitle')}</p>
        <div className="mt-3 flex flex-col gap-2">
          {canSave ? (
            <button
              type="button"
              onClick={onSave}
              className="min-h-touch rounded-xl bg-accent px-4 text-[15px] font-semibold text-paper"
            >
              {t('sheet.save')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-touch rounded-xl border border-hairline px-4 text-[15px] font-semibold text-over"
          >
            {t('sheet.discard')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="min-h-touch px-4 text-[15px] font-semibold text-muted"
          >
            {t('sheet.keepEditing')}
          </button>
        </div>
      </div>
    </div>
  );
}

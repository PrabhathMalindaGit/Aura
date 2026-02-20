import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { Button } from './Button';
import { focusFirstElement, trapTabKey } from '../../utils/focus';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  busy = false,
  returnFocusRef,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const fallbackFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const explicitReturnTarget = returnFocusRef?.current ?? null;
    fallbackFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      if (dialogRef.current) {
        focusFirstElement(dialogRef.current, cancelButtonRef.current);
      } else {
        cancelButtonRef.current?.focus();
      }
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (!dialogRef.current) {
        return;
      }

      trapTabKey(event, dialogRef.current);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;

      const target = explicitReturnTarget ?? fallbackFocusRef.current;
      target?.focus();
    };
  }, [onCancel, open, returnFocusRef]);

  if (!open) {
    return null;
  }

  const titleId = 'confirm-dialog-title';
  const descriptionId = 'confirm-dialog-description';

  return (
    <div className="confirm-dialog" role="presentation">
      <button
        type="button"
        className="confirm-dialog__overlay"
        aria-label="Dismiss confirmation"
        onClick={onCancel}
      />
      <section
        ref={dialogRef}
        className="confirm-dialog__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        <p id={descriptionId} className="confirm-dialog__description">
          {description}
        </p>
        <div className="confirm-dialog__actions">
          <Button ref={cancelButtonRef} variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

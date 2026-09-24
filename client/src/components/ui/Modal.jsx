import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './Button.jsx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus moves inside and is trapped, Escape closes, focus returns
 * to the opener, the page behind does not scroll. Full-screen on small phones.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const panel = useRef(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = panel.current;
    (el.querySelector('[data-autofocus]') || el.querySelector(FOCUSABLE))?.focus();

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if (e.key === 'Tab') {
        const items = [...el.querySelectorAll(FOCUSABLE)];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-slate-950/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={`flex max-h-dvh w-full flex-col bg-white shadow-xl sm:max-h-[90vh] sm:rounded-lg ${width}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for destructive or important actions. */
export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel = 'Confirm', tone = 'danger', loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-700">{children}</div>
    </Modal>
  );
}

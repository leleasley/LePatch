import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// A dialog that closes on escape, focuses the first field and restores the
// page scroll when it closes.
//
// It is rendered through a portal on `document.body` on purpose: any ancestor
// with a transform, filter or backdrop-filter becomes the containing block for
// `position: fixed`, which would pin the dialog to the page instead of the
// screen. Page animations set exactly such a transform.
export function Modal({ open, onClose, title, description, children, footer, labelledBy = 'lepatch-modal-title' }) {
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // On a phone, focusing a field opens the on-screen keyboard straight
    // away, which covers most of the dialog. Only focus where a hardware
    // keyboard is likely.
    const narrow = window.matchMedia('(max-width: 640px)').matches;
    if (!narrow) {
      const field = panel.current?.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
      const fallback = panel.current?.querySelector('button');
      (field || fallback)?.focus?.();
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panel}>
        {title ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h2 id={labelledBy}>{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
              <X size={16} />
            </button>
          </div>
        ) : null}
        {children}
        {footer ? <div className="modal-actions">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// Confirmation dialog used instead of the browser confirm dialog so the
// interface keeps a single visual language.
export function ConfirmDialog({ open, title, description, confirmLabel = 'Confirm', destructive, busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      labelledBy="lepatch-confirm-title"
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    />
  );
}

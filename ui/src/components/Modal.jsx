import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// A dialog that closes on escape, traps focus loosely and restores the page
// scroll when it closes.
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
    const focusable = panel.current?.querySelector('input, button, select, textarea, a[href]');
    focusable?.focus?.();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
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
    </div>
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

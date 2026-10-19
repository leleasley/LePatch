import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CircleCheck,
  error: TriangleAlert,
  info: Info,
};

// A toast is `{ id, kind, title, message, duration }`. Actions can pass a
// plain string, which is treated as the message, or an object with a title.
function normalize(input, kind) {
  if (typeof input === 'string') return { kind, message: input };
  return { kind: input.kind || kind, ...input };
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const push = useCallback(
    input => {
      counter.current += 1;
      const id = counter.current;
      const toast = { id, duration: 4600, ...normalize(input, 'info') };
      // Keep the newest four so a burst of live events cannot bury the page.
      setToasts(current => [...current.slice(-3), toast]);
      if (toast.duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), toast.duration));
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      notify: push,
      success: input => push(normalize(input, 'success')),
      error: input => push({ duration: 7000, ...normalize(input, 'error') }),
      info: input => push(normalize(input, 'info')),
    }),
    [toasts, dismiss, push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(toast => {
          const Icon = ICONS[toast.kind] || Info;
          return (
            <div className={`toast toast-${toast.kind}`} key={toast.id}>
              <span className="toast-icon">
                <Icon size={15} />
              </span>
              <div className="toast-copy">
                {toast.title ? <b>{toast.title}</b> : null}
                <span>{toast.message}</span>
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
                <X size={14} />
              </button>
              {toast.duration > 0 ? (
                <span className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

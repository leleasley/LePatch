"use client";

import { cn } from "@/lib/cn";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  onClick?: () => void;
};

type ToastContextType = {
  toasts: Toast[];
  addToast: (message: string, type?: Toast["type"], onClick?: () => void) => void;
  removeToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: Toast["type"] = "info", onClick?: () => void) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type, onClick }]);
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      {/* Announced to assistive tech: toasts were previously invisible to
          screen readers because the container had no live region. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[100] flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          const tone = {
            success: { border: "border-status-success/40", icon: "text-status-success", bg: "bg-status-success/10" },
            error: { border: "border-status-danger/40", icon: "text-status-danger", bg: "bg-status-danger/10" },
            info: { border: "border-border", icon: "text-accent", bg: "bg-accent/10" },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-panel px-3 py-2.5 text-sm shadow-md animate-toast-in",
                tone.border,
                toast.onClick && "cursor-pointer hover:bg-surface-elevated"
              )}
              onClick={() => {
                if (!toast.onClick) return;
                toast.onClick();
                removeToast(toast.id);
              }}
            >
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full", tone.bg)}>
                <Icon className={cn("h-3.5 w-3.5", tone.icon)} />
              </span>
              <span className="flex-1 text-text">{toast.message}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                aria-label="Dismiss notification"
                className="icon-button -mr-1 -mt-0.5 h-6 w-6"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

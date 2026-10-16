"use client";

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
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[calc(100%-1.5rem)] max-w-md pointer-events-none"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          const colorMap = {
            success: {
              bg: "bg-gradient-to-r from-emerald-600/20 to-emerald-500/10",
              border: "border-emerald-500/30",
              icon: "text-emerald-400",
              text: "text-emerald-100",
              glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]",
            },
            error: {
              bg: "bg-gradient-to-r from-red-600/20 to-red-500/10",
              border: "border-red-500/30",
              icon: "text-red-400",
              text: "text-red-100",
              glow: "shadow-[0_0_20px_rgba(239,68,68,0.15)]",
            },
            info: {
              bg: "bg-gradient-to-r from-cyan-600/20 to-cyan-500/10",
              border: "border-cyan-500/30",
              icon: "text-cyan-400",
              text: "text-cyan-100",
              glow: "shadow-[0_0_20px_rgba(6,182,212,0.15)]",
            },
          };
          const c = colorMap[toast.type];

          return (
            <div
              key={toast.id}
              role={toast.onClick ? "button" : undefined}
              tabIndex={toast.onClick ? 0 : undefined}
              onClick={() => {
                toast.onClick?.();
                removeToast(toast.id);
              }}
              onKeyDown={(e) => {
                if (toast.onClick && (e.key === "Enter" || e.key === " ")) {
                  toast.onClick();
                  removeToast(toast.id);
                }
              }}
              className={
                "pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm backdrop-blur-xl animate-toast-in " +
                c.bg + " " + c.border + " " + c.glow +
                (toast.onClick ? " cursor-pointer" : "")
              }
            >
              <div className={`shrink-0 rounded-full p-1 ${toast.type === "success" ? "bg-emerald-500/20" : toast.type === "error" ? "bg-red-500/20" : "bg-cyan-500/20"}`}>
                <Icon className={`h-4 w-4 ${c.icon}`} />
              </div>
              <span className={`flex-1 font-medium leading-snug ${c.text}`}>{toast.message}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10 transition-all -mr-1"
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

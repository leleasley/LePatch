"use client";

import { useEffect, useRef, useState, startTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  confirmText?: string;
  confirmPlaceholder?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  confirmText,
  confirmPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) {
      buttonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) startTransition(() => setTyped(""));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmStyles =
    variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-500/20"
      : "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/20";
  const confirmReady = !confirmText || typed === confirmText;

  return (
    <ModalShell open={open} onClose={onCancel} panelClassName="flex w-auto max-w-md flex-col p-6">
      <div className="relative flex max-h-full flex-col overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] to-transparent pointer-events-none" />
        <div className="relative flex items-start gap-4">
          {variant === "danger" && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
          )}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <button
                onClick={onCancel}
                className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">{message}</p>
            {variant === "danger" && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                Review this carefully. This action changes live data and may be irreversible.
              </div>
            )}
            {confirmText && (
              <div className="mt-4">
                <p className="text-xs text-slate-500">
                  Type <span className="font-mono text-slate-300">{confirmText}</span> to confirm.
                </p>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder={confirmPlaceholder || confirmText}
                  className="focus-ring mt-2 w-full rounded-lg border border-line/50 bg-surface px-3 py-2 text-sm text-white placeholder-slate-500 transition-all focus:border-cyan-500/50"
                />
              </div>
            )}
          </div>
        </div>
        <div className="relative mt-6 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/[0.06] hover:border-line"
          >
            {cancelLabel}
          </button>
          <button
            ref={buttonRef}
            onClick={onConfirm}
            disabled={!confirmReady}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${confirmStyles}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

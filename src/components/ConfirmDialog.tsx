"use client";

import { useEffect, useState, startTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { Input } from "@/components/ui/Input";

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
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) startTransition(() => setTyped(""));
  }, [open]);

  const confirmReady = !confirmText || typed === confirmText;

  return (
    <ModalShell open={open} onClose={onCancel} title={title} panelClassName="w-auto max-w-md p-6">
      <div className="flex items-start gap-4">
        {variant === "danger" && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-danger/10">
            <AlertTriangle className="h-5 w-5 text-status-danger" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-text">{title}</h2>
            <button type="button" onClick={onCancel} aria-label="Close" className="icon-button -mr-1 -mt-1">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">{message}</p>
          {variant === "danger" && (
            <div className="mt-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              Review this carefully. This action changes live data and may be irreversible.
            </div>
          )}
          {confirmText && (
            <div className="mt-4">
              <Input
                label={`Type ${confirmText} to confirm`}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={confirmPlaceholder || confirmText}
                data-autofocus
                className="font-mono"
              />
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex flex-col justify-end gap-2 sm:flex-row">
        <button type="button" onClick={onCancel} className="btn btn--secondary">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!confirmReady}
          data-autofocus={confirmText ? undefined : true}
          className={variant === "danger" ? "btn btn--danger" : "btn btn--primary"}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

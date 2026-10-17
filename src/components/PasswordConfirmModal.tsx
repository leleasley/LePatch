"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Lock, X } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";

type PasswordConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel?: string;
  error?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void> | void;
};

export function PasswordConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  busyLabel,
  error,
  busy = false,
  onCancel,
  onConfirm,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => {
        setPassword("");
        setShowPassword(false);
      }, 0);
      return () => clearTimeout(id);
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    await onConfirm(password);
  }

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      panelClassName="overflow-y-auto p-6"
    >
      <form onSubmit={handleSubmit} className="max-h-full">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-text-muted">
              <Lock className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text">{title}</h2>
              <p className="mt-1 text-sm text-text-muted">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="icon-button disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-xs font-medium text-text-muted">
            Current password
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id={inputId}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 pr-10 text-sm text-text placeholder:text-text-faint transition-colors focus:border-accent"
              placeholder="Enter password to continue"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="icon-button absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn--ghost">
            Cancel
          </button>
          <button type="submit" disabled={!password || busy} className="btn btn--primary">
            {busy ? busyLabel || "Working…" : confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

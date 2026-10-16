"use client";

import { useEffect, useRef, useState } from "react";
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
      <form
        onSubmit={handleSubmit}
        className="max-h-full"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-300">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-slate-300">Current password</span>
          <div className="mt-2 flex items-center rounded-lg border border-line/50 bg-white/5">
            <input
              ref={inputRef}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-white outline-none placeholder:text-slate-600"
              placeholder="Enter password to continue"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="mr-2 rounded-md p-1 text-slate-500 transition-colors hover:text-white"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!password || busy}
            className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy ? busyLabel || "Working..." : confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

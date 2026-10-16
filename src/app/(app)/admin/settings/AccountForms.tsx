"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, KeyRound, X, Loader2 } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { csrfFetch } from "@/lib/csrf-client";
import { PasswordInput } from "@/components/PasswordStrengthInput";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleChange() {
    setError("");
    setSubmitting(true);
    try {
      const response = await csrfFetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        if (data.sessionReset) {
          window.location.href = "/session-reset?reason=password-changed";
          return;
        }
        setCurrentPassword("");
        setNewPassword("");
        onClose();
      } else {
        setError(data.error || "Unable to change password");
      }
    } catch {
      setError("Unable to change password");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <ModalShell open={open} onClose={onClose} panelClassName="w-auto max-w-lg overflow-y-auto p-5 sm:p-6">
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] to-transparent pointer-events-none rounded-t-2xl sm:rounded-xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-2">
                <KeyRound className="h-4 w-4 text-cyan-400" />
              </div>
              <h2 className="text-lg font-semibold text-white">Change Password</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>

            <PasswordInput
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
              placeholder="min 10 characters"
            />

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="w-full sm:w-auto rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleChange}
                disabled={submitting || !currentPassword || newPassword.length < 10}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Changing...
                  </>
                ) : (
                  "Change Password"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

export function AccountForms({ user }: { user: User }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "error">("info");
  const [passwordOpen, setPasswordOpen] = useState(false);

  function show(msg: string, type: "info" | "error" = "info") {
    setMessage(msg);
    setMessageType(type);
  }

  async function saveProfile() {
    setSaving(true);
    show("");
    const body: Record<string, string> = { name };
    if (email !== user.email) body.email = email;

    const response = await csrfFetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (response.ok) {
      setEditing(false);
      show("Profile saved. You will be redirected to login if email was changed.");
      if (email !== user.email) {
        setTimeout(() => router.push("/session-reset?reason=email-changed"), 1500);
      }
    } else {
      show((await response.json()).error || "Unable to save profile", "error");
    }
  }

  const hasChanges = name !== user.name || email !== user.email;

  return (
    <>
      <div className="rounded-xl border border-line/50 bg-panel/80 p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-500/10 p-2">
              <Pencil className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Account Details</h3>
              <p className="text-xs text-slate-400">Update your name and email address</p>
            </div>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line/50 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.06] transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 font-medium mb-1.5">Email</label>
              <input
                value={email}
                type="email"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveProfile}
                disabled={saving || !hasChanges}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(user.name);
                  setEmail(user.email);
                }}
                className="rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2 text-sm text-slate-300 hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-line/40 bg-surface/50 px-3 py-2.5">
              <span className="text-slate-400">Name</span>
              <span className="font-medium text-white">{user.name}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line/40 bg-surface/50 px-3 py-2.5">
              <span className="text-slate-400">Email</span>
              <span className="font-medium text-white">{user.email}</span>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-line/50 pt-4">
          <button
            onClick={() => setPasswordOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line/50 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <KeyRound className="h-4 w-4 text-cyan-400" />
            Change Password
          </button>
        </div>

        {message && (
          <p className={`mt-4 rounded-lg border p-3 text-sm ${
            messageType === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          }`}>
            {message}
          </p>
        )}
      </div>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

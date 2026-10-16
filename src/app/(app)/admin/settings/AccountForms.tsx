"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Pencil, X } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { csrfFetch } from "@/lib/csrf-client";
import { PasswordInput } from "@/components/PasswordStrengthInput";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/List";

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
    <ModalShell open onClose={onClose} panelClassName="w-auto max-w-lg overflow-y-auto p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-text-muted" aria-hidden="true" />
          <h2 className="text-base font-semibold text-text">Change password</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="icon-button">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form
        className="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleChange();
        }}
      >
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          placeholder="Enter your current password"
        />

        <PasswordInput
          label="New password"
          value={newPassword}
          onChange={setNewPassword}
          placeholder="At least 10 characters"
        />

        {error && (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn btn--ghost">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !currentPassword || newPassword.length < 10}
            className="btn btn--primary"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Changing…
              </>
            ) : (
              "Change password"
            )}
          </button>
        </div>
      </form>
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
      <Panel
        title="Account"
        description="Your display name, email address and password."
        actions={
          !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="btn btn--ghost btn--sm">
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Edit
            </button>
          ) : undefined
        }
        flush
      >
        {editing ? (
          <form
            className="flex flex-col gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveProfile();
            }}
          >
            <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving || !hasChanges} className="btn btn--primary btn--sm">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Save
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setEditing(false);
                  setName(user.name);
                  setEmail(user.email);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <dl className="divide-y divide-divider">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-text-muted">Name</dt>
              <dd className="truncate text-sm font-medium text-text">{user.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-text-muted">Email</dt>
              <dd className="truncate text-sm font-medium text-text">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-text-muted">Password</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="btn btn--secondary btn--sm"
                >
                  <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Change password
                </button>
              </dd>
            </div>
          </dl>
        )}

        <p
          aria-live="polite"
          role={messageType === "error" ? "alert" : undefined}
          className={`border-t border-border px-4 py-2.5 text-xs ${
            message ? "" : "sr-only"
          } ${messageType === "error" ? "text-status-danger" : "text-status-success"}`}
        >
          {message}
        </p>
      </Panel>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </>
  );
}

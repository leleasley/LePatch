"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Key, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { csrfFetch } from "@/lib/csrf-client";
import { List, ListRow, Panel, RowAvatar } from "@/components/ui/List";
import { Switch } from "@/components/ui/Input";

type Passkey = {
  id: string;
  credentialId: string;
  transports: string[];
  deviceName: string | null;
  counter: number;
  createdAt: string;
  lastUsedAt: string | null;
};

export function PasskeysSection({ passwordEnabled }: { passwordEnabled: boolean; sessionId: string }) {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordLoginEnabled, setPasswordLoginEnabled] = useState(passwordEnabled);

  async function loadPasskeys() {
    setLoading(true);
    const response = await fetch("/api/account/webauthn");
    if (response.ok) {
      const data = await response.json();
      setPasskeys(data.passkeys);
    }
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadPasskeys(); }, []);

  async function registerPasskey() {
    setRegistering(true);
    setError("");
    setMessage("");
    try {
      const optionsResponse = await csrfFetch("/api/webauthn/register/options", { method: "POST" });
      if (!optionsResponse.ok) {
        const data = await optionsResponse.json();
        throw new Error(data.error || "Failed to get registration options");
      }
      const options = await optionsResponse.json();
      const regResponse = await startRegistration(options);
      const verifyResponse = await csrfFetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regResponse),
      });
      if (!verifyResponse.ok) {
        const data = await verifyResponse.json();
        throw new Error(data.error || "Registration verification failed");
      }
      setMessage("Passkey registered successfully");
      loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  async function deletePasskey(id: string) {
    setDeleting(true);
    setError("");
    setMessage("");
    const response = await csrfFetch("/api/account/webauthn", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleting(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Failed to delete passkey");
      return;
    }
    setMessage("Passkey deleted");
    loadPasskeys();
  }

  async function togglePassword() {
    setToggling(true);
    setError("");
    setMessage("");
    const newValue = !passwordLoginEnabled;
    const response = await csrfFetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordEnabled: newValue }),
    });
    setToggling(false);
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Failed to update setting");
    } else {
      setPasswordLoginEnabled(newValue);
      setMessage(newValue ? "Password login enabled" : "Password login disabled");
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  return (
    <Panel
      title="Passkeys"
      description="Sign in with your device biometrics or PIN instead of a password."
      actions={
        <button
          type="button"
          onClick={registerPasskey}
          disabled={registering}
          className="btn btn--primary btn--sm"
        >
          {registering ? (
            <>
              <Spinner size="sm" />
              Registering…
            </>
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Register passkey
            </>
          )}
        </button>
      }
      flush
    >
      <ConfirmDialog
        open={!!deletingId}
        title="Delete passkey"
        message="Are you sure you want to delete this passkey? You will not be able to sign in with it anymore."
        confirmLabel="Delete"
        variant="danger"
        confirmText="DELETE"
        onConfirm={() => {
          if (deletingId) {
            deletePasskey(deletingId);
            setDeletingId(null);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />

      {loading ? (
        <p className="px-4 py-3 text-sm text-text-muted">Loading passkeys…</p>
      ) : passkeys.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-muted">No passkeys registered.</p>
      ) : (
        <List>
          {passkeys.map((passkey) => (
            <ListRow
              key={passkey.id}
              leading={
                <RowAvatar tone="accent">
                  <Key className="h-4 w-4" aria-hidden="true" />
                </RowAvatar>
              }
              title={
                <span className="truncate text-sm font-medium text-text">
                  {passkey.deviceName || "Unnamed passkey"}
                </span>
              }
              subtitle={`Created ${formatDate(passkey.createdAt)}${
                passkey.lastUsedAt ? ` · Last used ${formatDate(passkey.lastUsedAt)}` : ""
              }`}
              trailing={
                <button
                  type="button"
                  onClick={() => setDeletingId(passkey.id)}
                  disabled={deleting}
                  className="icon-button text-text-faint hover:text-status-danger disabled:opacity-50"
                  aria-label={`Delete ${passkey.deviceName || "unnamed passkey"}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              }
            />
          ))}
        </List>
      )}

      <div className="border-t border-border p-4">
        <Switch
          checked={!passwordLoginEnabled}
          onChange={() => togglePassword()}
          disabled={toggling || passkeys.length === 0}
          label="Disable password login"
          description="Only allow sign-in via passkeys."
        />
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-border px-4 py-2.5 text-xs text-status-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="border-t border-border px-4 py-2.5 text-xs text-status-success"
        >
          {message}
        </p>
      )}
    </Panel>
  );
}

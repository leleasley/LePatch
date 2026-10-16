"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { Key, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import { csrfFetch } from "@/lib/csrf-client";

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
    <section className="rounded-lg border border-line bg-panel p-4">
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

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-medium">Passkeys</h2>
        </div>
        <button
          onClick={registerPasskey}
          disabled={registering}
          className="focus-ring inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent disabled:opacity-60 transition-colors"
        >
          {registering ? (
            <>
              <Spinner size="sm" />
              Registering
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" />
              Register a new passkey
            </>
          )}
        </button>
      </div>

      <p className="mb-4 text-sm text-text-muted">
        Passkeys let you sign in using your device biometrics or PIN instead of a password. They are more secure and resistant to phishing.
      </p>

      {loading ? (
        <p className="text-sm text-text-muted">Loading passkeys...</p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-text-muted">No passkeys registered</p>
      ) : (
        <div className="space-y-2">
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="flex items-center justify-between rounded-md border border-line bg-surface p-3 text-sm">
              <div>
                <span className="text-text">{passkey.deviceName || "Unnamed passkey"}</span>
                <div className="mt-0.5 text-xs text-text-muted">
                  Created {formatDate(passkey.createdAt)}
                  {passkey.lastUsedAt && <> &middot; Last used {formatDate(passkey.lastUsedAt)}</>}
                </div>
              </div>
              <button
                onClick={() => setDeletingId(passkey.id)}
                disabled={deleting}
                className="focus-ring rounded p-1 text-text-muted hover:text-status-danger transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <div>
          <span className="text-sm text-text">Disable password login</span>
          <p className="text-xs text-text-muted">Only allow sign-in via passkeys</p>
        </div>
        <button
          onClick={togglePassword}
          disabled={toggling || passkeys.length === 0}
          className={`focus-ring relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            passwordLoginEnabled ? "bg-slate-600" : "bg-accent"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ${
              passwordLoginEnabled ? "translate-x-0" : "translate-x-5"
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-500/40 bg-status-danger/10 px-3 py-2 text-sm text-red-200">{error}</p>
      )}
      {message && (
        <p className="mt-3 rounded-md border border-emerald-500/40 bg-status-success/10 px-3 py-2 text-sm text-emerald-200">{message}</p>
      )}
    </section>
  );
}

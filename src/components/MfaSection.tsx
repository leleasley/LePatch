"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldOff, Copy, Check, RefreshCw, Download } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { PasswordConfirmModal } from "@/components/PasswordConfirmModal";
import { QrCode } from "@/components/QrCode";
import { Panel } from "@/components/ui/List";
import { Input } from "@/components/ui/Input";

type MfaStatus = {
  enabled: boolean;
  backupCodesRemaining: number;
};

export function MfaSection({}: { userEmail: string }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupState, setSetupState] = useState<"idle" | "setup" | "verify" | "done" | "error">("idle");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [issuer, setIssuer] = useState("LePatch");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [error, setError] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [passwordModal, setPasswordModal] = useState<null | "disable" | "regen">(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await csrfFetch("/api/account/mfa");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ enabled: false, backupCodesRemaining: 0 });
    } finally {
      setLoading(false);
    }
  }

  async function startSetup() {
    setError("");
    try {
      const res = await csrfFetch("/api/account/mfa/setup", { method: "POST" });
      const data = await res.json();
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      if (data.issuer) setIssuer(data.issuer);
      setSetupState("setup");
    } catch {
      setError("Failed to start MFA setup");
      setSetupState("error");
    }
  }

  async function verifyAndEnable() {
    setError("");
    if (verifyCode.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    try {
      const res = await csrfFetch("/api/account/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode, secret }),
      });
      const data = await res.json();
      if (data.success) {
        setBackupCodes(data.backupCodes || []);
        setSetupState("done");
        fetchStatus();
      } else {
        setError(data.error || "Invalid code. Try again.");
      }
    } catch {
      setError("Verification failed. Try again.");
    }
  }

  async function disableMfa(password: string) {
    setDisabling(true);
    setError("");
    try {
      const res = await csrfFetch("/api/account/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ enabled: false, backupCodesRemaining: 0 });
        setBackupCodes([]);
        setPasswordModal(null);
      } else {
        setError(data.error || "Failed to disable MFA");
      }
    } catch {
      setError("Failed to disable MFA");
    } finally {
      setDisabling(false);
    }
  }

  async function regenerateBackupCodes(password: string) {
    setRegenerating(true);
    setError("");
    try {
      const res = await csrfFetch("/api/account/mfa/backup-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.backupCodes) {
        setBackupCodes(data.backupCodes);
        setPasswordModal(null);
        fetchStatus();
      } else {
        setError(data.error || "Failed to regenerate codes");
      }
    } catch {
      setError("Failed to regenerate codes");
    } finally {
      setRegenerating(false);
    }
  }

  function copyAllCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  }

  function downloadCodes() {
    const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lepatch-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const backupCodeGrid = (codes: string[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {codes.map((code, i) => (
        <div
          key={i}
          className="mono rounded-md border border-border bg-surface px-2 py-1.5 text-center text-xs text-text"
        >
          {code}
        </div>
      ))}
    </div>
  );

  const codeActions = (
    <div className="flex gap-1.5">
      <button type="button" onClick={copyAllCodes} className="btn btn--ghost btn--sm">
        {copiedCodes ? (
          <Check className="h-3 w-3 text-status-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3 w-3" aria-hidden="true" />
        )}
        {copiedCodes ? "Copied" : "Copy"}
      </button>
      <button type="button" onClick={downloadCodes} className="btn btn--ghost btn--sm">
        <Download className="h-3 w-3" aria-hidden="true" />
        Download
      </button>
    </div>
  );

  if (loading) {
    return (
      <Panel title="Multi-factor authentication">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading MFA status…
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Multi-factor authentication"
      description={
        status?.enabled
          ? `Enabled · ${status.backupCodesRemaining} backup codes remaining`
          : "Require a code from an authenticator app at sign-in."
      }
      actions={
        !status?.enabled && setupState === "idle" ? (
          <button type="button" onClick={startSetup} className="btn btn--primary btn--sm">
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Enable MFA
          </button>
        ) : undefined
      }
      className="flex flex-col"
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger"
        >
          {error}
        </p>
      )}

      {/* Setup flow */}
      {setupState === "idle" && !status?.enabled && (
        <p className="text-sm text-text-muted">
          TOTP MFA requires an authenticator app such as Google Authenticator, Authy or 1Password.
          Once enabled, you will need a code from the app every time you sign in.
        </p>
      )}

      {setupState === "setup" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Step 1 · Add to your authenticator
            </p>
            <p className="mt-1.5 text-sm text-text-muted">
              Scan this QR code with your authenticator app, or enter the key manually.
              Authenticator apps will show this as <strong className="font-medium text-text">{issuer}</strong>.
            </p>
            <div className="mt-3 flex flex-col items-center gap-3">
              <QrCode value={otpauthUrl} size={180} className="p-3" />
              <div className="w-full">
                <p className="mb-1 text-xs text-text-muted">Manual entry key</p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2">
                  <code className="mono flex-1 break-all text-sm text-accent">{secret}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(secret)}
                    className="icon-button h-7 w-7 shrink-0"
                    aria-label="Copy secret key"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Step 2 · Verify
            </p>
            <p className="mt-1.5 text-sm text-text-muted">
              Enter the 6-digit code from your authenticator app to confirm setup.
            </p>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Verification code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="mono text-center tracking-[0.3em]"
                />
              </div>
              <button
                type="button"
                onClick={verifyAndEnable}
                disabled={verifyCode.length !== 6}
                className="btn btn--primary"
              >
                Verify and enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup complete — show backup codes */}
      {setupState === "done" && backupCodes.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="rounded-md border border-status-success/40 bg-status-success/10 px-3 py-2 text-sm text-status-success">
            MFA enabled successfully.
          </p>
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                Backup codes
              </p>
              {codeActions}
            </div>
            <p className="mb-3 text-sm text-text-muted">
              Save these codes somewhere safe. Each code can only be used once. If you lose access to
              your authenticator, you can use one of these to sign in.
            </p>
            {backupCodeGrid(backupCodes)}
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                setSetupState("idle");
                setBackupCodes([]);
              }}
              className="btn btn--secondary"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* MFA enabled — management */}
      {status?.enabled && setupState === "idle" && (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-sm text-status-success">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            MFA is enabled on your account.
          </p>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
              Regenerate backup codes
            </p>
            <p className="mt-1.5 mb-3 text-sm text-text-muted">
              {status.backupCodesRemaining} backup codes remaining. Regenerating will invalidate all
              existing codes.
            </p>
            <button
              type="button"
              onClick={() => setPasswordModal("regen")}
              disabled={regenerating}
              className="btn btn--secondary btn--sm"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Regenerate
            </button>
          </div>

          {backupCodes.length > 0 && (
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">
                  New backup codes
                </p>
                {codeActions}
              </div>
              {backupCodeGrid(backupCodes)}
            </div>
          )}

          <div className="rounded-md border border-status-danger/30 bg-status-danger/10 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-danger">
              <ShieldOff className="h-4 w-4" aria-hidden="true" />
              Disable MFA
            </p>
            <p className="mt-1.5 mb-3 text-sm text-text-muted">
              This removes the TOTP requirement from your account. You can re-enable it at any time.
            </p>
            <button
              type="button"
              onClick={() => setPasswordModal("disable")}
              disabled={disabling}
              className="btn btn--danger btn--sm"
            >
              <ShieldOff
                className={`h-3.5 w-3.5 ${disabling ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Disable
            </button>
          </div>
        </div>
      )}

      <PasswordConfirmModal
        open={passwordModal === "regen"}
        title="Regenerate backup codes"
        description="Enter your password to invalidate the existing backup codes and generate a new set."
        confirmLabel="Regenerate"
        busyLabel="Regenerating…"
        busy={regenerating}
        error={passwordModal === "regen" ? error : undefined}
        onCancel={() => {
          if (!regenerating) {
            setPasswordModal(null);
            setError("");
          }
        }}
        onConfirm={regenerateBackupCodes}
      />

      <PasswordConfirmModal
        open={passwordModal === "disable"}
        title="Disable MFA"
        description="Enter your password to remove TOTP sign-in protection from this account."
        confirmLabel="Disable MFA"
        busyLabel="Disabling…"
        busy={disabling}
        error={passwordModal === "disable" ? error : undefined}
        onCancel={() => {
          if (!disabling) {
            setPasswordModal(null);
            setError("");
          }
        }}
        onConfirm={disableMfa}
      />
    </Panel>
  );
}

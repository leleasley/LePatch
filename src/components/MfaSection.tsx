"use client";

import { useState, useEffect } from "react";
import { Shield, ShieldCheck, ShieldOff, Copy, Check, RefreshCw, Download } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { PasswordConfirmModal } from "@/components/PasswordConfirmModal";
import { QrCode } from "@/components/QrCode";

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

  if (loading) {
    return (
      <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading MFA status...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`rounded-lg p-2 ${status?.enabled ? "bg-status-success/10 text-status-success" : "bg-status-warning/10 text-status-warning"}`}>
          {status?.enabled ? <ShieldCheck className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
        </div>
        <div>
          <h3 className="font-semibold text-text">Multi-Factor Authentication</h3>
          <p className="text-xs text-text-muted">
            {status?.enabled
              ? `Enabled · ${status.backupCodesRemaining} backup codes remaining`
              : "Add an extra layer of security to your account"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-status-danger/10 border border-status-danger/30 px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Setup Flow */}
      {setupState === "idle" && !status?.enabled && (
        <div>
          <p className="mb-4 text-sm text-text-muted">
            TOTP MFA requires an authenticator app like Google Authenticator, Authy, or 1Password.
            Once enabled, you&apos;ll need to enter a code from your app every time you sign in.
          </p>
          <button
            onClick={startSetup}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
          >
            <Shield className="h-4 w-4" />
            Enable MFA
          </button>
        </div>
      )}

      {setupState === "setup" && (
        <div className="space-y-4">
          <div className="rounded-lg bg-black/30 border border-line/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Step 1: Add to authenticator</p>
            <p className="text-sm text-text mb-3">
              Scan this QR code with your authenticator app, or enter the secret manually:
              Authenticator apps will show this as <strong className="text-text">{issuer}</strong>.
            </p>
            <div className="flex flex-col items-center gap-3">
              <QrCode value={otpauthUrl} size={180} className="p-3" />
              <div className="w-full">
                <p className="text-xs text-text-muted mb-1">Manual entry key:</p>
                <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-line/30 px-3 py-2">
                  <code className="flex-1 text-sm font-mono text-accent break-all">{secret}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(secret)}
                    className="shrink-0 rounded p-1 text-text-muted hover:text-text transition-colors"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-black/30 border border-line/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Step 2: Verify</p>
            <p className="text-sm text-text mb-3">
              Enter the 6-digit code from your authenticator app to confirm setup:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 rounded-lg border border-line/50 bg-white/5 px-4 py-2.5 text-center text-lg font-mono tracking-[0.3em] text-text placeholder-slate-600 focus:border-cyan-500/50 focus:outline-none"
              />
              <button
                onClick={verifyAndEnable}
                disabled={verifyCode.length !== 6}
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Verify & Enable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Complete — Show Backup Codes */}
      {setupState === "done" && backupCodes.length > 0 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-status-success/10 border border-status-success/30 px-4 py-3">
            <p className="text-sm font-medium text-status-success">MFA enabled successfully!</p>
          </div>
          <div className="rounded-lg bg-black/30 border border-line/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Backup Codes</p>
              <div className="flex gap-2">
                <button onClick={copyAllCodes} className="inline-flex items-center gap-1 rounded border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors">
                  {copiedCodes ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                  {copiedCodes ? "Copied" : "Copy"}
                </button>
                <button onClick={downloadCodes} className="inline-flex items-center gap-1 rounded border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors">
                  <Download className="h-3 w-3" />
                  Download
                </button>
              </div>
            </div>
            <p className="mb-3 text-sm text-text-muted">
              Save these codes somewhere safe. Each code can only be used once. If you lose access to your authenticator, you can use these to sign in.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {backupCodes.map((code, i) => (
                <div key={i} className="rounded bg-white/5 border border-line/30 px-2 py-1.5 text-center font-mono text-sm text-accent">
                  {code}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => { setSetupState("idle"); setBackupCodes([]); }}
            className="rounded-lg bg-white/5 border border-line/50 px-4 py-2 text-sm text-text hover:bg-white/10 transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* MFA Enabled — Management */}
      {status?.enabled && setupState === "idle" && (
        <div className="space-y-4">
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 px-4 py-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-status-success" />
            <span className="text-sm text-status-success">MFA is enabled on your account</span>
          </div>

          {/* Regenerate Backup Codes */}
          <div className="rounded-lg bg-black/30 border border-line/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">Regenerate Backup Codes</p>
            <p className="text-sm text-text-muted mb-3">
              {status.backupCodesRemaining} backup codes remaining. Regenerating will invalidate all existing codes.
            </p>
            <button
              onClick={() => setPasswordModal("regen")}
              disabled={regenerating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-line/50 px-4 py-2 text-sm text-text hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
              Regen
            </button>
          </div>

          {/* Show current backup codes if we just regenerated */}
          {backupCodes.length > 0 && setupState === "idle" && (
            <div className="rounded-lg bg-black/30 border border-line/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium uppercase tracking-wider text-text-muted">New Backup Codes</p>
                <div className="flex gap-2">
                  <button onClick={copyAllCodes} className="inline-flex items-center gap-1 rounded border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors">
                    {copiedCodes ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                    {copiedCodes ? "Copied" : "Copy"}
                  </button>
                  <button onClick={downloadCodes} className="inline-flex items-center gap-1 rounded border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors">
                    <Download className="h-3 w-3" />
                    Download
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {backupCodes.map((code, i) => (
                  <div key={i} className="rounded bg-white/5 border border-line/30 px-2 py-1.5 text-center font-mono text-sm text-accent">
                    {code}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disable MFA */}
          <div className="rounded-lg bg-black/30 border border-red-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldOff className="h-4 w-4 text-status-danger" />
              <p className="text-xs font-medium uppercase tracking-wider text-status-danger">Disable MFA</p>
            </div>
            <p className="text-sm text-text-muted mb-3">
              This will remove the TOTP requirement from your account. You can re-enable it at any time.
            </p>
            <button
              onClick={() => setPasswordModal("disable")}
              disabled={disabling}
              className="inline-flex items-center gap-1.5 rounded-lg bg-status-danger/10 border border-status-danger/30 px-4 py-2 text-sm text-status-danger hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <ShieldOff className={`h-3.5 w-3.5 ${disabling ? "animate-spin" : ""}`} />
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
        busyLabel="Regenerating..."
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
        busyLabel="Disabling..."
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
    </div>
  );
}

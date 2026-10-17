"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldCheck, Copy, Check, Download, Eye, EyeOff } from "lucide-react";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { Panel } from "@/components/ui/List";
import { QrCode } from "@/components/QrCode";
import { csrfFetch } from "@/lib/csrf-client";
import { cn } from "@/lib/cn";

export function MfaSetupFlow({ setupToken }: { email: string; setupToken: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "scan" | "verify" | "backup" | "done">("intro");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [issuer, setIssuer] = useState("LePatch");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError("");
    try {
      const res = await csrfFetch("/api/account/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start setup. Please try again.");
        return;
      }
      setSecret(data.secret);
      setOtpauthUrl(data.otpauthUrl);
      if (data.issuer) setIssuer(data.issuer);
      setStep("scan");
    } catch {
      setError("Failed to start setup. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndEnable() {
    if (verifyCode.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await csrfFetch("/api/account/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode, setupToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupCodes(data.backupCodes || []);
        setStep("backup");
      } else {
        setError(data.error || "Invalid code. Check your authenticator app and try again.");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copySecretKey() {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
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

  return (
    <div className="w-full">
      <img src="/icons/icon-192.png" alt="LePatch" className="h-9 w-9 rounded-md" />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-text">Set up two-factor authentication</h1>
      <p className="mt-1 text-sm text-text-muted">
        MFA is required. Use an authenticator app such as Google Authenticator, Authy, or 1Password.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      <div className="mt-6">
        {step === "intro" && (
          <Panel>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-text">Authenticator app</h2>
                  <p className="text-xs text-text-muted">Confirm you have one installed.</p>
                </div>
              </div>
              <p className="text-sm text-text-muted">
                You&apos;ll enter the 6-digit code shown in the app each time you sign in.
              </p>
              <button type="button" onClick={startSetup} disabled={loading} className="btn btn--primary btn--lg w-full">
                {loading ? (
                  <>
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Setting up
                  </>
                ) : (
                  "Get started"
                )}
              </button>
            </div>
          </Panel>
        )}

        {step === "scan" && (
          <Panel>
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-sm font-semibold text-text">Step 1: Add to your authenticator</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Scan the QR code. The app will show this as <strong className="font-semibold text-text">{issuer}</strong>.
                </p>
              </div>

              <div className="flex justify-center">
                <QrCode value={otpauthUrl} size={180} />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-text-muted">Can&apos;t scan? Enter this secret key:</p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                  <code className={cn("flex-1 break-all font-mono text-sm text-text", !showSecret && "select-none blur-sm")}>
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    aria-label={showSecret ? "Hide secret" : "Show secret"}
                    className="icon-button h-7 w-7"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={copySecretKey}
                    aria-label="Copy secret key"
                    className="icon-button h-7 w-7"
                  >
                    {copiedSecret ? <Check className="h-4 w-4 text-status-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <button type="button" onClick={() => setStep("verify")} className="btn btn--primary btn--lg w-full">
                I&apos;ve added it — continue
              </button>
            </div>
          </Panel>
        )}

        {step === "verify" && (
          <Panel>
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-sm font-semibold text-text">Step 2: Verify setup</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Enter the 6-digit code currently shown in your authenticator app.
                </p>
              </div>

              <OtpCodeInput value={verifyCode} onChange={setVerifyCode} autoFocus label="Authenticator code" />

              <button
                type="button"
                onClick={verifyAndEnable}
                disabled={verifyCode.length !== 6 || loading}
                className="btn btn--primary btn--lg w-full"
              >
                {loading ? (
                  <>
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Verifying
                  </>
                ) : (
                  "Verify and enable"
                )}
              </button>
              <button
                type="button"
                onClick={() => setStep("scan")}
                className="text-center text-sm text-text-muted transition-colors hover:text-text"
              >
                Back to QR code
              </button>
            </div>
          </Panel>
        )}

        {step === "backup" && (
          <Panel>
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-status-success/30 bg-status-success/10 text-status-success">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-text">MFA enabled</h2>
                  <p className="text-xs text-text-muted">Save your backup codes somewhere safe.</p>
                </div>
              </div>

              <div className="rounded-md border border-status-warning/40 bg-status-warning/10 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-status-warning">Backup codes</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={copyAllCodes} className="btn btn--secondary btn--sm">
                      {copiedCodes ? <Check className="h-3 w-3 text-status-success" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                      {copiedCodes ? "Copied" : "Copy"}
                    </button>
                    <button type="button" onClick={downloadCodes} className="btn btn--secondary btn--sm">
                      <Download className="h-3 w-3" aria-hidden="true" />
                      Download
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-sm text-text-muted">
                  Each code works once. If you lose your authenticator, these are the only way back in.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, i) => (
                    <div key={i} className="rounded-md border border-border bg-surface px-3 py-2 text-center font-mono text-sm text-text">
                      {code}
                    </div>
                  ))}
                </div>
              </div>

              <button type="button" onClick={() => setStep("done")} className="btn btn--primary btn--lg w-full">
                I&apos;ve saved my backup codes
              </button>
            </div>
          </Panel>
        )}

        {step === "done" && (
          <Panel>
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-status-success/30 bg-status-success/10 text-status-success">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-text">You&apos;re all set</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Two-factor authentication is enabled. You&apos;ll need your authenticator app each time you sign in.
                </p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="btn btn--primary btn--lg w-full"
              >
                Continue to dashboard
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

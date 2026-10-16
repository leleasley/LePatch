"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldCheck, Copy, Check, Download, Eye, EyeOff } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { csrfFetch } from "@/lib/csrf-client";
import { QrCode } from "@/components/QrCode";

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
    <div className="w-full max-w-lg animate-fade-in">
      {/* Logo */}
      <div className="mb-8 text-center">
        <img src="/assets/Logo.png" alt="LePatch" className="mx-auto h-14 w-14 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-text">Set Up Two-Factor Authentication</h1>
        <p className="mt-2 text-sm text-text-muted">
          MFA is required for all accounts. This adds an extra layer of security to your account.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      {/* Step: Intro */}
      {step === "intro" && (
        <div className="rounded-2xl border border-line/50 bg-panel/80 backdrop-blur-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/10 p-3">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h2 className="font-semibold text-text">Authenticator App Required</h2>
              <p className="text-xs text-text-muted">Google Authenticator, Authy, 1Password, etc.</p>
            </div>
          </div>
          <p className="text-sm text-text leading-relaxed">
            You&apos;ll need an authenticator app on your phone to complete setup. Once configured,
            you&apos;ll enter a 6-digit code from the app each time you sign in.
          </p>
          <button
            onClick={startSetup}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent disabled:opacity-60"
          >
            {loading ? <><Spinner size="sm" /> Setting up</> : "Get Started"}
          </button>
        </div>
      )}

      {/* Step: Scan QR */}
      {step === "scan" && (
        <div className="rounded-2xl border border-line/50 bg-panel/80 backdrop-blur-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-text mb-1">Step 1: Add to Authenticator</h2>
            <p className="text-sm text-text-muted">
              Scan the QR code below with your authenticator app.
              The app will show this as <strong className="text-text">{issuer}</strong>.
            </p>
          </div>

          {/* QR Code */}
          <div className="flex justify-center">
            <QrCode value={otpauthUrl} size={200} className="p-3" />
          </div>

          {/* Manual Secret */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">
              Can&apos;t scan? Enter this secret key manually:
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-black/40 border border-line/50 px-4 py-3">
              <code className={`flex-1 text-sm font-mono text-accent break-all ${showSecret ? "" : "blur-sm select-none"}`}>
                {secret}
              </code>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-text transition-colors"
                title={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                onClick={copySecretKey}
                className="shrink-0 rounded-lg p-1.5 text-text-muted hover:text-text transition-colors"
                title="Copy secret key"
              >
                {copiedSecret ? <Check className="h-4 w-4 text-status-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setStep("verify")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
          >
            I&apos;ve added it — Continue
          </button>
        </div>
      )}

      {/* Step: Verify Code */}
      {step === "verify" && (
        <div className="rounded-2xl border border-line/50 bg-panel/80 backdrop-blur-sm p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-text mb-1">Step 2: Verify Setup</h2>
            <p className="text-sm text-text-muted">
              Enter the 6-digit code currently shown in your authenticator app to confirm it&apos;s working.
            </p>
          </div>
          <OtpCodeInput
            value={verifyCode}
            onChange={setVerifyCode}
            autoFocus
            label="Authenticator code"
          />
          {error && (
            <p className="text-sm text-status-danger">{error}</p>
          )}
          <button
            onClick={verifyAndEnable}
            disabled={verifyCode.length !== 6 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent disabled:opacity-60"
          >
            {loading ? <><Spinner size="sm" /> Verifying</> : "Verify & Enable"}
          </button>
          <button
            onClick={() => setStep("scan")}
            className="w-full text-center text-sm text-text-muted hover:text-text transition-colors"
          >
            Back to QR code
          </button>
        </div>
      )}

      {/* Step: Backup Codes */}
      {step === "backup" && (
        <div className="rounded-2xl border border-line/50 bg-panel/80 backdrop-blur-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-status-success/10 p-3">
              <ShieldCheck className="h-6 w-6 text-status-success" />
            </div>
            <div>
              <h2 className="font-semibold text-text">MFA Enabled!</h2>
              <p className="text-xs text-text-muted">Save your backup codes somewhere safe</p>
            </div>
          </div>

          <div className="rounded-xl bg-black/40 border border-status-warning/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider text-status-warning">Backup Codes</p>
              <div className="flex gap-1.5">
                <button
                  onClick={copyAllCodes}
                  className="inline-flex items-center gap-1 rounded-lg border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  {copiedCodes ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                  {copiedCodes ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={downloadCodes}
                  className="inline-flex items-center gap-1 rounded-lg border border-line/50 px-2 py-1 text-xs text-text-muted hover:text-text transition-colors"
                >
                  <Download className="h-3 w-3" />
                  Download
                </button>
              </div>
            </div>
            <p className="mb-3 text-sm text-text-muted">
              Each code can only be used once. If you lose your authenticator, these codes are your only way back in.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div key={i} className="rounded-lg bg-white/5 border border-line/30 px-3 py-2 text-center font-mono text-sm text-accent">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep("done")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
          >
            I&apos;ve saved my backup codes
          </button>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <div className="rounded-2xl border border-line/50 bg-panel/80 backdrop-blur-sm p-6 space-y-4 text-center">
          <div className="mx-auto rounded-2xl bg-status-success/10 p-4 w-fit">
            <ShieldCheck className="h-10 w-10 text-status-success" />
          </div>
          <h2 className="text-xl font-bold text-text">You&apos;re All Set!</h2>
          <p className="text-sm text-text-muted">
            Two-factor authentication is now enabled on your account.
            You&apos;ll need your authenticator app each time you sign in.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
          >
            Continue to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

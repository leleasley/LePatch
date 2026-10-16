"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, KeyRound } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { csrfFetch } from "@/lib/csrf-client";

export function MfaVerifyForm({ token }: { token: string }) {
  const router = useRouter();
  const [mfaCode, setMfaCode] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaBackupMode, setMfaBackupMode] = useState(false);
  const [mfaBackupCode, setMfaBackupCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);

  async function verifyMfa() {
    setMfaLoading(true);
    setMfaError("");

    const body = mfaBackupMode
      ? { mfaToken: token, backupCode: mfaBackupCode, rememberDevice }
      : { mfaToken: token, code: mfaCode, rememberDevice };

    try {
      const response = await csrfFetch("/api/auth/mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setMfaError(data.error || "Invalid code");
        setMfaLoading(false);
        return;
      }
      router.push("/dashboard?toast=logged-in");
      router.refresh();
    } catch {
      setMfaError("Verification failed");
      setMfaLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_25px_90px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]" />
        <div className="relative">
          <div className="mb-6 flex items-start gap-4 sm:mb-8">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="hidden text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80 sm:block">Security Check</p>
              <h1 className="mt-1 text-2xl font-semibold text-text sm:mt-2 sm:text-3xl">Confirm it&apos;s you</h1>
              <p className="mt-2 hidden text-sm leading-6 text-text-muted sm:block">
                Enter the code from your authenticator app. The verification step now lives on its own dedicated route.
              </p>
            </div>
          </div>

          {mfaError && (
            <p className="mb-5 rounded-2xl border border-red-500/30 bg-status-danger/10 px-4 py-3 text-sm text-red-200">
              {mfaError}
            </p>
          )}

          {!mfaBackupMode ? (
            <div className="space-y-5">
              <OtpCodeInput
                value={mfaCode}
                onChange={setMfaCode}
                autoFocus
                disabled={mfaLoading}
                label="Authenticator code"
              />
              <button
                onClick={verifyMfa}
                disabled={mfaCode.length !== 6 || mfaLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 font-medium text-accent-foreground transition-all hover:bg-cyan-300 disabled:opacity-60"
              >
                {mfaLoading ? <><Spinner size="sm" /> Verifying</> : "Continue"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-text">Backup code</span>
                <input
                  type="text"
                  value={mfaBackupCode}
                  onChange={(event) => setMfaBackupCode(event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8))}
                  placeholder="XXXXXXXX"
                  maxLength={8}
                  autoFocus
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-center font-mono text-lg tracking-[0.28em] text-text placeholder:text-text-faint focus:border-cyan-400/50 focus:outline-none"
                />
              </label>
              <button
                onClick={verifyMfa}
                disabled={mfaBackupCode.length !== 8 || mfaLoading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 font-medium text-accent-foreground transition-all hover:bg-cyan-300 disabled:opacity-60"
              >
                {mfaLoading ? <><Spinner size="sm" /> Verifying</> : "Use Backup Code"}
              </button>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <label className="flex items-center gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-surface text-accent"
              />
              Remember this device for 30 days
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={() => {
                setMfaBackupMode(!mfaBackupMode);
                setMfaError("");
                setMfaCode("");
                setMfaBackupCode("");
              }}
              className="text-left text-text-muted transition-colors hover:text-accent"
            >
              {mfaBackupMode ? "Use authenticator app instead" : "Use a backup code instead"}
            </button>
            <button
              onClick={() => router.push("/login")}
              className="inline-flex items-center gap-2 text-left text-text-muted transition-colors hover:text-text"
            >
              <KeyRound className="h-4 w-4" />
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

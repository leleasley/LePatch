"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { OtpCodeInput } from "@/components/OtpCodeInput";
import { Field } from "@/components/ui/Input";
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
    <div className="w-full">
      <img src="/icons/icon-192.png" alt="LePatch" className="h-9 w-9 rounded-md" />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-text">Confirm it&apos;s you</h1>
      <p className="mt-1 text-sm text-text-muted">Enter the 6-digit code from your authenticator app.</p>

      {mfaError && (
        <p role="alert" className="mt-4 rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {mfaError}
        </p>
      )}

      {!mfaBackupMode ? (
        <div className="mt-6 flex flex-col gap-4">
          <OtpCodeInput
            value={mfaCode}
            onChange={setMfaCode}
            autoFocus
            disabled={mfaLoading}
            label="Authenticator code"
          />
          <button
            type="button"
            onClick={verifyMfa}
            disabled={mfaCode.length !== 6 || mfaLoading}
            className="btn btn--primary btn--lg w-full"
          >
            {mfaLoading ? (
              <>
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Verifying
              </>
            ) : (
              "Continue"
            )}
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Field label="Backup code" htmlFor="mfa-backup-code">
            <input
              id="mfa-backup-code"
              type="text"
              value={mfaBackupCode}
              onChange={(event) => setMfaBackupCode(event.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8))}
              placeholder="XXXXXXXX"
              maxLength={8}
              autoFocus
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-center font-mono text-lg tracking-[0.3em] text-text placeholder:text-text-faint focus:border-accent"
            />
          </Field>
          <button
            type="button"
            onClick={verifyMfa}
            disabled={mfaBackupCode.length !== 8 || mfaLoading}
            className="btn btn--primary btn--lg w-full"
          >
            {mfaLoading ? (
              <>
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Verifying
              </>
            ) : (
              "Use backup code"
            )}
          </button>
        </div>
      )}

      <label className="mt-5 flex items-center gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(event) => setRememberDevice(event.target.checked)}
          className="h-4 w-4 rounded border-border accent-accent"
        />
        Remember this device for 30 days
      </label>

      <div className="mt-6 flex flex-col gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            setMfaBackupMode(!mfaBackupMode);
            setMfaError("");
            setMfaCode("");
            setMfaBackupCode("");
          }}
          className="text-left text-text-muted transition-colors hover:text-text"
        >
          {mfaBackupMode ? "Use authenticator app instead" : "Use a backup code"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex items-center gap-1.5 text-left text-text-muted transition-colors hover:text-text"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Back to login
        </button>
      </div>
    </div>
  );
}

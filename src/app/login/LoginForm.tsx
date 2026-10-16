"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Spinner } from "@/components/Spinner";
import { csrfFetch } from "@/lib/csrf-client";
import { KeyRound, ArrowRight } from "lucide-react";

export function LoginForm({ githubOAuthEnabled = false }: { githubOAuthEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnError, setWebauthnError] = useState("");
  const [webauthnAvailable] = useState(() => typeof window !== "undefined" && !!window.PublicKeyCredential);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await csrfFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      if (data.mfaRequired && data.mfaToken) {
        router.push(`/mfa?token=${encodeURIComponent(data.mfaToken)}`);
        router.refresh();
        return;
      }
      if (data.mfaSetupRequired) {
        window.location.href = `/setup/mfa?token=${data.mfaSetupToken}`;
        return;
      }
      router.push("/dashboard?toast=logged-in");
      router.refresh();
    } catch {
      setError("Login failed");
      setLoading(false);
      return;
    }
  }

  async function passkeyAuth() {
    setWebauthnLoading(true);
    setWebauthnError("");
    try {
      const optionsResponse = await fetch("/api/webauthn/auth/options");
      if (!optionsResponse.ok) throw new Error("Unable to start passkey authentication");
      const options = await optionsResponse.json();
      const authResponse = await startAuthentication(options);
      const verifyResponse = await csrfFetch("/api/webauthn/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: options.flowId, ...authResponse }),
      });
      const data = await verifyResponse.json();
      if (!verifyResponse.ok) {
        throw new Error(data.error || "Passkey authentication failed");
      }
      if (data.mfaRequired && data.mfaToken) {
        router.push(`/mfa?token=${encodeURIComponent(data.mfaToken)}`);
        router.refresh();
        return;
      }
      if (data.mfaSetupRequired) {
        window.location.href = `/setup/mfa?token=${data.mfaSetupToken}`;
        return;
      }
      router.push("/dashboard?toast=logged-in");
      router.refresh();
    } catch (err) {
      setWebauthnError(err instanceof Error ? err.message : "Passkey authentication failed");
    } finally {
      setWebauthnLoading(false);
    }
  }

  const showGitHub = githubOAuthEnabled;

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm">
        <span className="text-slate-300 font-medium">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
        />
      </label>
      <label className="block text-sm">
        <span className="text-slate-300 font-medium">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
        />
      </label>
      {error && (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
      )}
      <button
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3.5 font-medium text-slate-950 transition-all hover:bg-cyan-300 disabled:opacity-60"
        disabled={loading}
      >
        {loading ? <><Spinner size="sm" /> Signing in</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
      </button>

      {(showGitHub || webauthnAvailable) && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-[0.2em] text-slate-500">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      )}

      {showGitHub && (
        <a
          href="/api/auth/github?mode=login"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/[0.06] hover:border-white/20"
        >
          <img src="/assets/github.svg" alt="" className="h-4 w-4" />
          Sign in with GitHub
        </a>
      )}

      {webauthnAvailable && (
        <button
          type="button"
          onClick={passkeyAuth}
          disabled={webauthnLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/[0.06] hover:border-white/20 disabled:opacity-60"
        >
          {webauthnLoading ? <><Spinner size="sm" /> Authenticating</> : <><KeyRound className="h-4 w-4" /> Sign in with Passkey</>}
        </button>
      )}

      {webauthnError && (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{webauthnError}</p>
      )}
    </form>
  );
}

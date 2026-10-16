"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound, ArrowRight } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { Input } from "@/components/ui/Input";
import { csrfFetch } from "@/lib/csrf-client";

export function LoginForm({ githubOAuthEnabled = false }: { githubOAuthEnabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [webauthnError, setWebauthnError] = useState("");
  // Read after mount: the server has no `window`, so an initializer that
  // touches it would render different HTML and break hydration.
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  useEffect(() => {
    // Mount-only browser capability check — intentionally not derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebauthnAvailable(!!window.PublicKeyCredential);
  }, []);

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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Input
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />
      <Input
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Your password"
      />

      {error && (
        <p role="alert" className="rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--lg w-full" disabled={loading}>
        {loading ? (
          <>
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Signing in
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </button>

      {(showGitHub || webauthnAvailable) && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-faint">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {showGitHub && (
        <a href="/api/auth/github?mode=login" className="btn btn--secondary w-full">
          <img src="/assets/github.svg" alt="" aria-hidden="true" className="h-4 w-4" />
          Sign in with GitHub
        </a>
      )}

      {webauthnAvailable && (
        <button type="button" onClick={passkeyAuth} disabled={webauthnLoading} className="btn btn--secondary w-full">
          {webauthnLoading ? (
            <>
              <Spinner size="sm" />
              Authenticating
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Sign in with passkey
            </>
          )}
        </button>
      )}

      {webauthnError && (
        <p role="alert" className="rounded-md border border-status-danger/40 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {webauthnError}
        </p>
      )}
    </form>
  );
}

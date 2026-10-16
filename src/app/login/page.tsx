import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign In" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard?toast=already-signed-in");
  }

  const githubOAuthEnabled = await getIntegrationSettingValue("github", "oauthEnabled");

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_80%_15%,rgba(96,165,250,0.1),transparent_18%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <section className="hidden max-w-2xl lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">LePatch Control</p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.02] text-text sm:text-6xl">
              Patch management that feels deliberate, not duct-taped.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-text-muted sm:text-lg">
              Cleaner auth flow, dedicated MFA verification, and a login screen that looks like it belongs in the app.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Live</p>
                <p className="mt-3 text-lg font-semibold text-text">Fleet visibility</p>
                <p className="mt-2 text-sm text-text-muted">See package drift, alerts, scans, and rollout state in one place.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Safe</p>
                <p className="mt-3 text-lg font-semibold text-text">Protected access</p>
                <p className="mt-2 text-sm text-text-muted">Session resets stay local to the correct host instead of falling back to localhost.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-muted">Fast</p>
                <p className="mt-3 text-lg font-semibold text-text">Passkeys + MFA</p>
                <p className="mt-2 text-sm text-text-muted">Use a passkey or password, then land on a dedicated verification screen.</p>
              </div>
            </div>
          </section>

          <section className="w-full">
            <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/80 p-6 shadow-[0_25px_90px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]" />
              <div className="relative">
                <div className="mb-6 sm:mb-8">
                  <img src="/assets/Logo.png" alt="LePatch" className="h-14 w-14 rounded-2xl sm:h-16 sm:w-16" />
                  <h2 className="mt-4 text-2xl font-semibold text-text sm:mt-5 sm:text-3xl">Sign in</h2>
                  <p className="mt-2 hidden text-sm leading-6 text-text-muted sm:block">
                    Access your dashboard, review your fleet, and keep releases moving.
                  </p>
                </div>
                <Suspense>
                  <LoginForm githubOAuthEnabled={githubOAuthEnabled === "true"} />
                </Suspense>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

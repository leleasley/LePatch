import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { AuthShell } from "@/components/StatusPage";
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
    <AuthShell>
      <img src="/assets/Logo.png" alt="LePatch" className="h-9 w-9 rounded-md" />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-text">Sign in</h1>
      <p className="mt-1 text-sm text-text-muted">Monitor releases and get notified when something ships.</p>

      <div className="mt-6">
        <Suspense fallback={null}>
          <LoginForm githubOAuthEnabled={githubOAuthEnabled === "true"} />
        </Suspense>
      </div>

      <p className="mt-6 text-xs text-text-muted">
        First time here?{" "}
        <Link href="/setup" className="text-accent underline-offset-2 hover:underline">
          Run setup
        </Link>
      </p>
    </AuthShell>
  );
}

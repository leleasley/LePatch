import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AuthShell } from "@/components/StatusPage";
import { SetupWizard } from "./SetupWizard";

export const metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");

  return (
    <AuthShell>
      <img src="/assets/Logo.png" alt="LePatch" className="h-9 w-9 rounded-md" />
      <h1 className="mt-5 text-xl font-semibold tracking-tight text-text">Set up LePatch</h1>
      <p className="mt-1 text-sm text-text-muted">Create the first admin account and connect notifications.</p>

      <div className="mt-6">
        <SetupWizard />
      </div>
    </AuthShell>
  );
}

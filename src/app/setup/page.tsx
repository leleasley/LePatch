import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupWizard } from "./SetupWizard";

export const metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const count = await prisma.user.count();
  if (count > 0) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-panel p-8">
        <div className="mb-6 text-center">
          <img src="/assets/Logo.png" alt="LePatch" className="mx-auto h-12 w-12" />
          <h1 className="mt-4 text-2xl font-semibold">LePatch Setup</h1>
          <p className="mt-1 text-sm text-slate-400">Configure your self-hosted release monitor</p>
        </div>
        <SetupWizard />
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { verifyMfaSetupToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MfaSetupFlow } from "./MfaSetupFlow";

export const metadata = { title: "Set Up Two-Factor Auth" };
export const dynamic = "force-dynamic";

export default async function SetupMfaPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  if (!token) redirect("/login");

  const payload = await verifyMfaSetupToken(token);
  if (!payload) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { totpEnabled: true, email: true },
  });

  if (!user) redirect("/login");
  if (user.totpEnabled) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <MfaSetupFlow email={user.email} setupToken={token} />
    </div>
  );
}
// cache bust Mon Jun 15 07:42:05 UTC 2026

import { redirect } from "next/navigation";
import { AuthShell } from "@/components/StatusPage";
import { MfaVerifyForm } from "./MfaVerifyForm";

export const metadata = { title: "Verify MFA" };
export const dynamic = "force-dynamic";

export default async function MfaPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;

  if (!token) {
    redirect("/login");
  }

  return (
    <AuthShell>
      <MfaVerifyForm token={token} />
    </AuthShell>
  );
}

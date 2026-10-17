import Link from "next/link";
import { AuthShell } from "@/components/StatusPage";

export const metadata = { title: "Session Reset" };
export const dynamic = "force-dynamic";

const reasons: Record<string, { title: string; message: string }> = {
  "invalid-session": {
    title: "439 Invalid Session",
    message: "Your session could not be verified anymore, so LePatch signed you out and cleared the stale credentials.",
  },
  "password-changed": {
    title: "Password Changed",
    message: "Your password was changed successfully. All sessions have been signed out for security reasons.",
  },
  "email-changed": {
    title: "Email Changed",
    message: "Your email address was changed. You need to sign in again with your new email.",
  },
  "session-expired": {
    title: "Session Expired",
    message: "Your session has expired. Please sign in again to continue.",
  },
};

export default async function SessionResetPage(props: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason: reasonKey } = await props.searchParams;
  const reason = reasons[reasonKey || ""] || reasons["session-expired"];

  return (
    <AuthShell>
      <img src="/icons/icon-192.png" alt="LePatch" className="h-9 w-9 rounded-md" />
      <h1 className="mt-5 text-lg font-semibold tracking-tight text-text">{reason.title}</h1>
      <p className="mt-1.5 text-sm text-text-muted">{reason.message}</p>
      <Link href="/login" className="btn btn--primary btn--lg mt-6 w-full">
        Sign in again
      </Link>
    </AuthShell>
  );
}

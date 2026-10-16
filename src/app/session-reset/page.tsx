import Link from "next/link";

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
  const loginHref = "/login";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.06)_0%,_transparent_60%)]" />
      <div className="w-full max-w-sm animate-fade-in">
        <div className="relative rounded-xl border border-line bg-panel/90 p-8 shadow-[0_0_30px_rgba(34,211,238,0.05)] backdrop-blur">
          <div className="mb-6 text-center">
            <img src="/assets/Logo.png" alt="LePatch" className="mx-auto h-14 w-14" />
            <h1 className="mt-4 text-2xl font-semibold text-text">{reason.title}</h1>
            <p className="mt-2 text-sm text-text-muted">{reason.message}</p>
          </div>
          <Link
            href={loginHref}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
          >
            Sign in again
          </Link>
        </div>
      </div>
    </div>
  );
}

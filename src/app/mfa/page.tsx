import { redirect } from "next/navigation";
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
    <div className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_80%_15%,rgba(96,165,250,0.1),transparent_18%)]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="hidden max-w-sm pr-12 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-300/80">LePatch Access</p>
          <h2 className="mt-4 text-5xl font-semibold leading-tight text-text">
            Secure sign-in without the clutter.
          </h2>
          <p className="mt-6 text-base leading-7 text-text-muted">
            Dedicated verification flow, cleaner routing, and an OTP input that supports direct paste.
          </p>
        </div>
        <div className="w-full max-w-md lg:max-w-none">
          <MfaVerifyForm token={token} />
        </div>
      </div>
    </div>
  );
}

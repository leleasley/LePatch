import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type StatusAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

type StatusPageProps = {
  code: string;
  title: string;
  description: string;
  note?: string;
  actions?: StatusAction[];
  children?: ReactNode;
};

/**
 * Single centred column shared by the auth and status routes.
 *
 * One narrow measure, flat surfaces and hairline borders — no marketing panel,
 * artwork or gradient behind the form.
 */
export function AuthShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("flex min-h-dvh items-center justify-center bg-canvas px-4 py-10", className)}>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export function StatusPage({ code, title, description, note, actions = [], children }: StatusPageProps) {
  return (
    <AuthShell>
      <div className="flex items-center gap-2.5">
        <img src="/icons/icon-192.png" alt="LePatch" className="h-8 w-8 rounded-md" />
        <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-text-faint">{code}</span>
      </div>

      <h1 className="mt-5 text-lg font-semibold tracking-tight text-text">{title}</h1>
      <p className="mt-1.5 text-sm text-text-muted">{description}</p>

      {note ? (
        <p className="mt-4 break-words rounded-md border border-border bg-panel px-3 py-2 text-xs leading-5 text-text-muted">
          {note}
        </p>
      ) : null}

      {children}

      {actions.length > 0 ? (
        <div className="mt-6 flex flex-col gap-2">
          {actions.map((action) => (
            <Link
              key={`${action.href}:${action.label}`}
              href={action.href}
              className={cn("btn w-full", action.variant === "secondary" ? "btn--secondary" : "btn--primary")}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </AuthShell>
  );
}

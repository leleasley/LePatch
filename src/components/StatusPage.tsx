import type { ReactNode } from "react";
import Link from "next/link";

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

export function StatusPage({ code, title, description, note, actions = [], children }: StatusPageProps) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-surface px-3 py-8 sm:px-4 sm:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.10),_transparent_45%),linear-gradient(180deg,_rgba(12,20,36,0.8),_rgba(5,11,20,1))]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(90deg,_transparent,_rgba(34,211,238,0.12),_transparent)] blur-3xl" />

      <div className="relative w-full max-w-lg animate-fade-in">
        <div className="overflow-hidden rounded-2xl border border-line/70 bg-panel/90 shadow-[0_20px_80px_rgba(2,8,23,0.65)] backdrop-blur-xl">
          <div className="border-b border-line/60 px-5 py-5 sm:px-8 sm:py-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <img src="/assets/Logo.png" alt="LePatch" className="h-10 w-10 rounded-xl shadow-lg shadow-cyan-500/10 sm:h-12 sm:w-12" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300 sm:text-xs sm:tracking-[0.35em]">{code}</div>
                <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-5 py-5 sm:space-y-5 sm:px-8 sm:py-7">
            <p className="text-sm leading-6 text-slate-300">{description}</p>
            {note ? (
              <div className="break-all rounded-xl border border-line/60 bg-surface-elevated/70 px-3 py-2.5 text-xs leading-5 text-slate-400 sm:break-normal sm:px-4 sm:py-3 sm:text-sm">
                {note}
              </div>
            ) : null}

            {children}

            {actions.length > 0 ? (
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:gap-3">
                {actions.map((action) => (
                  <Link
                    key={`${action.href}:${action.label}`}
                    href={action.href}
                    className={
                      action.variant === "secondary"
                        ? "focus-ring inline-flex items-center justify-center rounded-lg border border-line/60 bg-surface px-4 py-2.5 text-sm font-medium text-slate-200 transition-all hover:border-cyan-500/30 hover:text-white"
                        : "focus-ring inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400"
                    }
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

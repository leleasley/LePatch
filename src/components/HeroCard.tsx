import type { ReactNode } from "react";

export function HeroCard({
  icon,
  kicker,
  title,
  subtitle,
  badges,
  actions,
  children,
  compact = false,
}: {
  icon?: ReactNode;
  kicker?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface-elevated/60 p-5 sm:p-6${compact ? "" : " sm:p-8"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {kicker && (
                <div className="text-[0.68rem] font-medium uppercase tracking-wide text-text-faint">{kicker}</div>
              )}
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-text sm:text-3xl">{title}</h1>
            </div>
          </div>

          {subtitle && <p className="mt-2 max-w-2xl text-sm text-text-muted">{subtitle}</p>}

          {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mt-5 sm:mt-6">{children}</div>}
    </section>
  );
}
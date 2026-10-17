import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Panel — the base surface for any grouped content                           */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding — use when the body is a list of rows. */
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-border bg-panel", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* List — dense rows instead of tables                                        */
/* -------------------------------------------------------------------------- */

export function List({ className, children, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cn("divide-y divide-divider", className)} {...props}>
      {children}
    </ul>
  );
}

export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  href,
  onClick,
  selected,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}) {
  const content = (
    <>
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</div>}
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint">{meta}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
    </>
  );

  const base = cn(
    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
    selected ? "bg-accent/10" : "hover:bg-surface",
    className
  );

  if (href) {
    return (
      <li>
        <Link href={href} className={base}>
          {content}
        </Link>
      </li>
    );
  }

  if (onClick) {
    return (
      <li>
        <button type="button" onClick={onClick} className={base}>
          {content}
        </button>
      </li>
    );
  }

  return <li className={cn("flex items-start gap-3 px-4 py-3", className)}>{content}</li>;
}

/** Section label inside a list (grouped rows). */
export function ListGroupLabel({ children }: { children: ReactNode }) {
  return (
    <li className="bg-surface px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-text-faint">
      {children}
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "accent";

const dotStyles: Record<StatusTone, string> = {
  neutral: "bg-text-faint",
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  accent: "bg-accent",
};

/** Small coloured dot + label. Replaces the pill-everywhere look. */
export function StatusDot({
  tone = "neutral",
  children,
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotStyles[tone], pulse && "animate-pulse")}
      />
      {children}
    </span>
  );
}

/** Larger leading avatar/icon tile for a list row. */
export function RowAvatar({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  const tones: Record<StatusTone, string> = {
    neutral: "border-border bg-surface text-text-muted",
    success: "border-status-success/30 bg-status-success/10 text-status-success",
    warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
    danger: "border-status-danger/30 bg-status-danger/10 text-status-danger",
    accent: "border-accent/30 bg-accent/10 text-accent",
  };
  return (
    <span className={cn("flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                    */
/* -------------------------------------------------------------------------- */

export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

/** Borderless inline metric row — replaces a row of four identical stat cards. */
export function MetricStrip({ items }: { items: Array<{ label: string; value: ReactNode; tone?: StatusTone; href?: string }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map((item) => {
        const inner = (
          <>
            <dt className="text-2xs font-medium uppercase tracking-wide text-text-faint">{item.label}</dt>
            <dd
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums",
                item.tone === "danger"
                  ? "text-status-danger"
                  : item.tone === "warning"
                    ? "text-status-warning"
                    : item.tone === "success"
                      ? "text-status-success"
                      : "text-text"
              )}
            >
              {item.value}
            </dd>
          </>
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className="rounded-md transition-colors hover:bg-surface">
            {inner}
          </Link>
        ) : (
          <div key={item.label}>{inner}</div>
        );
      })}
    </dl>
  );
}
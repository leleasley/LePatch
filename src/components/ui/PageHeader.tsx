import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Compact page header.
 *
 * Replaces the old `HeroCard`: a large padded card with a kicker, oversized
 * title and subtitle, repeated at the top of every page. A page now opens with a
 * single line of context and its actions on the same row.
 */
export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  meta,
  className,
}: {
  breadcrumb?: Array<{ label: string; href?: string }>;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small inline facts shown under the title (repo name, counts, status). */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-2">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
              {breadcrumb.map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && (
                    <span aria-hidden="true" className="text-text-faint">
                      /
                    </span>
                  )}
                  {item.href ? (
                    <Link href={item.href} className="transition-colors hover:text-text">
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-text">
                      {item.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight text-text sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p>}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Label + value pair used inside `PageHeader`'s `meta` slot. */
export function MetaItem({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && <span aria-hidden="true" className="text-text-faint">{icon}</span>}
      {children}
    </span>
  );
}
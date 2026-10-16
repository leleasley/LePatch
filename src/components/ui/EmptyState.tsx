import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/40 px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">{icon}</div>}
      <div className="text-sm font-semibold text-text">{title}</div>
      {description && <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
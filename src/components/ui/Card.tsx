import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  padding?: "none" | "sm" | "md" | "lg";
  interactive?: boolean;
};

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({ className, padding = "md", interactive = false, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-elevated/60 shadow-sm backdrop-blur-none",
        interactive && "transition-colors hover:border-accent/40 hover:bg-surface-elevated/80",
        paddingStyles[padding],
        className
      )}
      {...props}
    >
      {children as ReactNode}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b border-border px-4 py-3", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-text", className)} {...props}>
      {children}
    </h3>
  );
}
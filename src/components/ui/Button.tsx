import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-accent-foreground border-accent hover:opacity-90",
  secondary: "bg-surface-elevated text-text border-border hover:border-accent/40",
  ghost: "bg-transparent text-text border-border hover:bg-surface-elevated",
  danger: "bg-status-failure/10 text-status-failure border-status-failure/30 hover:bg-status-failure/20",
  subtle: "bg-transparent text-text-muted border-transparent hover:text-text hover:bg-surface-elevated/60",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children as ReactNode}
    </button>
  );
}
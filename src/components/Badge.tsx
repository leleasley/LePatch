const variantStyles: Record<string, string> = {
  success: "bg-status-success/10 text-status-success border-status-success/30 shadow-[inset_0_1px_0_rgba(52,211,153,0.1)]",
  warning: "bg-status-warning/10 text-status-warning border-status-warning/30 shadow-[inset_0_1px_0_rgba(251,191,36,0.1)]",
  error: "bg-status-danger/10 text-status-danger border-status-danger/30 shadow-[inset_0_1px_0_rgba(248,113,113,0.1)]",
  info: "bg-accent/10 text-accent border-accent/40 shadow-[inset_0_1px_0_rgba(34,211,238,0.1)]",
  neutral: "bg-slate-500/10 text-text border-slate-500/20 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]",
};

export function Badge({
  variant = "neutral",
  children,
  dot = false,
  title,
}: {
  variant?: "success" | "warning" | "error" | "info" | "neutral";
  children: React.ReactNode;
  dot?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm ${variantStyles[variant]}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            variant === "success"
              ? "bg-emerald-400"
              : variant === "warning"
                ? "bg-amber-400"
                : variant === "error"
                  ? "bg-red-400"
                  : variant === "info"
                    ? "bg-accent"
                    : "bg-slate-400"
          }`}
        />
      )}
      {children}
    </span>
  );
}

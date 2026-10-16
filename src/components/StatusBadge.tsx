import { Check, Clock, Minus, X } from "lucide-react";
import type { CommitDisplayStatus } from "@/lib/github";

const LABELS: Record<CommitDisplayStatus, string> = {
  success: "Passing",
  failure: "Failing",
  in_progress: "Running",
  pending: "Pending",
  neutral: "No checks",
};

const SIZES = {
  sm: { padding: "0.2rem 0.5rem", fontSize: "0.7rem", icon: 11 },
  md: { padding: "0.3rem 0.65rem", fontSize: "0.75rem", icon: 12 },
  lg: { padding: "0.4rem 0.85rem", fontSize: "0.82rem", icon: 14 },
} as const;

type Variant = "default" | "icon-only" | "dot";
type Size = keyof typeof SIZES;

export function StatusBadge({
  status,
  size = "md",
  variant = "default",
  label,
  className,
}: {
  status: CommitDisplayStatus;
  size?: Size;
  variant?: Variant;
  label?: string;
  className?: string;
}) {
  const sizeCfg = SIZES[size];

  if (variant === "dot") {
    return (
      <span
        className={`status-pill status-pill--${status} ${className || ""}`}
        style={{ padding: 0, width: 10, height: 10, borderRadius: 999 }}
        aria-label={label || LABELS[status]}
        title={label || LABELS[status]}
      />
    );
  }

  const icon =
    status === "success" ? (
      <Check strokeWidth={3} style={{ width: sizeCfg.icon, height: sizeCfg.icon }} />
    ) : status === "failure" ? (
      <X strokeWidth={3} style={{ width: sizeCfg.icon, height: sizeCfg.icon }} />
    ) : status === "in_progress" ? (
      <span
        className="spin"
        style={{
          width: sizeCfg.icon,
          height: sizeCfg.icon,
          border: "1.5px solid currentColor",
          borderTopColor: "transparent",
          borderRadius: 999,
          display: "inline-block",
        }}
        aria-hidden
      />
    ) : status === "pending" ? (
      <Clock style={{ width: sizeCfg.icon, height: sizeCfg.icon }} />
    ) : (
      <Minus style={{ width: sizeCfg.icon, height: sizeCfg.icon }} />
    );

  if (variant === "icon-only") {
    return (
      <span
        className={`status-pill status-pill--${status} ${className || ""}`}
        style={{ padding: sizeCfg.icon === 11 ? "0.2rem" : "0.3rem" }}
        aria-label={label || LABELS[status]}
        title={label || LABELS[status]}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      className={`status-pill status-pill--${status} ${className || ""}`}
      style={{ padding: sizeCfg.padding, fontSize: sizeCfg.fontSize }}
    >
      {icon}
      {label || LABELS[status]}
    </span>
  );
}

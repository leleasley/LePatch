import type { ReactNode } from "react";

const TONES = {
  default: "var(--theme-text)",
  success: "var(--theme-status-success)",
  failure: "var(--theme-status-failure)",
  pending: "var(--theme-status-pending)",
  stale: "var(--theme-status-pending)",
  muted: "var(--theme-text-faint)",
  accent: "var(--theme-accent)",
} as const;

export function StatPill({
  icon,
  label,
  value,
  tone = "default",
  href,
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONES;
  href?: string;
  className?: string;
}) {
  const content = (
    <div className={`app-stat ${className || ""}`}>
      <div className="app-stat-label">
        {icon}
        {label}
      </div>
      <div
        className="app-stat-value truncate"
        style={{ color: TONES[tone] }}
      >
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block focus-visible:outline-none">
        {content}
      </a>
    );
  }
  return content;
}

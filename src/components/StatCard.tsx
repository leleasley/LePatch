"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import { cn } from "@/lib/cn";

const iconColors = {
  cyan: "text-accent",
  green: "text-status-success",
  amber: "text-status-pending",
  red: "text-status-failure",
  purple: "text-accent",
};

export function StatCard({
  label,
  value,
  detail,
  icon,
  trend,
  accent,
  liveDate,
}: {
  label: string;
  value?: string | number;
  detail?: string;
  icon?: React.ReactNode;
  trend?: "up" | "down" | null;
  accent?: "cyan" | "green" | "amber" | "red" | "purple";
  liveDate?: Date | string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated/60 p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-text-faint">{label}</div>
        {icon && <div className={cn(iconColors[accent ?? "cyan"])}>{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-text">
          {liveDate !== undefined && liveDate !== null ? <LiveTimestamp date={liveDate} /> : value}
        </div>
        {trend === "up" && <TrendingUp className="h-4 w-4 text-status-success" />}
        {trend === "down" && <TrendingDown className="h-4 w-4 text-status-failure" />}
      </div>
      {detail && <div className="mt-1 text-xs text-text-muted">{detail}</div>}
    </div>
  );
}
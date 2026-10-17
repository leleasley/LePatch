"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime } from "@/lib/time-ago";

/**
 * Relative timestamp that does not break hydration.
 *
 * "3m ago" depends on the current time, so the server render and the client
 * hydration can disagree whenever a minute boundary passes between the two —
 * React then throws the whole page away and re-renders from scratch (error
 * #418). `suppressHydrationWarning` tells React the first paint is allowed to
 * differ, and the interval keeps it fresh afterwards.
 */
export function RelativeTime({
  value,
  prefix,
  className,
}: {
  value: Date | string | null;
  prefix?: string;
  className?: string;
}) {
  const [, force] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!value) return <span className={className}>unknown</span>;

  const date = typeof value === "string" ? new Date(value) : value;
  const text = `${prefix ?? ""}${formatRelativeTime(date)}`.trimStart();

  return (
    <time dateTime={date.toISOString()} title={date.toLocaleString()} suppressHydrationWarning className={className}>
      {text}
    </time>
  );
}

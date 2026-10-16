"use client";

import { useState, useEffect } from "react";

function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 0) return "just now";
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(then).toLocaleDateString();
}

function getUpdateInterval(date: Date | string): number {
  const now = Date.now();
  const then = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 5_000;
  if (seconds < 3600) return 30_000;
  if (seconds < 86400) return 300_000;
  return 600_000;
}

export function LiveTimestamp({
  date,
  className,
}: {
  date: Date | string | null;
  className?: string;
}) {
  const [display, setDisplay] = useState<string>(() => (date ? timeAgo(date) : "Never"));

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!date) {
        setDisplay("Never");
        return;
      }
      setDisplay(timeAgo(date));
    }, 0);

    if (!date) return () => clearTimeout(timeoutId);

    const interval = setInterval(() => {
      setDisplay(timeAgo(date));
    }, getUpdateInterval(date));
    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
  }, [date]);

  return (
    <span className={className} title={date ? new Date(date).toLocaleString() : undefined}>
      {display}
    </span>
  );
}

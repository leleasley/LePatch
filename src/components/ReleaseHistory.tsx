"use client";

import { useState } from "react";
import Link from "next/link";
import { Tag, Clock, Bell, AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import { ReleaseNotes } from "@/components/ReleaseNotes";

type Release = {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: Date | null;
  detectedAt: Date;
  ignored: boolean;
  notificationSent: boolean;
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return date.toLocaleDateString();
}

export function ReleaseHistory({ releases }: { releases: Release[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(releases[0]?.id || null);

  if (releases.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">
          <Tag className="h-5 w-5" />
        </span>
        <p className="empty-state-title">No releases stored yet</p>
        <p className="empty-state-copy">Run a check to populate release history for this repository.</p>
      </div>
    );
  }

  return (
    <div className="app-shell-card p-2.5 sm:p-3">
      <ol className="timeline">
        {releases.map((release, idx) => {
          const isExpanded = expandedId === release.id;
          const hasNotes = release.body && release.body.trim().length > 0;
          const isFirst = idx === 0;
          const dotTone = release.prerelease ? "amber" : isFirst ? "default" : "muted";
          return (
            <li key={release.id} className="relative pb-3 last:pb-0">
              <span className={`timeline-dot timeline-dot--${dotTone}`} />

              <div
                className={`rounded-xl border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_45%,transparent)] transition-all ${
                  isExpanded ? "shadow-sm" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : release.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--theme-text)_3%,transparent)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--theme-text)] app-mono">{release.tagName}</span>
                      {release.name && release.name !== release.tagName && (
                        <span className="text-sm text-[var(--theme-text-muted)] truncate">— {release.name}</span>
                      )}
                      {release.prerelease && (
                        <span className="status-pill status-pill--pending" style={{ padding: "0.15rem 0.45rem", fontSize: "0.65rem" }}>
                          <AlertTriangle className="h-2.5 w-2.5" /> Pre-release
                        </span>
                      )}
                      {release.notificationSent && (
                        <span className="status-pill status-pill--success" style={{ padding: "0.15rem 0.45rem", fontSize: "0.65rem" }}>
                          <Bell className="h-2.5 w-2.5" /> Notified
                        </span>
                      )}
                      {release.ignored && (
                        <span className="text-[0.7rem] text-[var(--theme-text-faint)]">Ignored</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-[var(--theme-text-faint)]">
                      {release.publishedAt && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(release.publishedAt)}
                        </span>
                      )}
                      {!hasNotes && <span>No notes</span>}
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 mt-0.5 shrink-0 text-[var(--theme-text-faint)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
                {isExpanded && (
                  <div className="border-t border-[var(--theme-divider)] px-4 py-3 sm:px-5 sm:py-4 animate-fade-in">
                    {hasNotes ? (
                      <ReleaseNotes body={release.body} />
                    ) : (
                      <p className="text-sm text-[var(--theme-text-faint)]">This release has no notes.</p>
                    )}
                    <div className="mt-3 flex items-center gap-3">
                      <Link
                        href={release.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[0.78rem] text-[var(--theme-accent)] hover:text-[var(--theme-accent-hover)] transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" /> View release
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

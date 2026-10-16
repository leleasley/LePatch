"use client";

import { useState } from "react";
import { ExternalLink, Tag, Clock, ArrowUpRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { ReleaseNotes } from "@/components/ReleaseNotes";

type Release = {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  prerelease: boolean;
  publishedAt: Date | null;
};

export function LatestReleaseHero({
  latestRelease,
  previousTag,
  updateAvailable,
}: {
  latestRelease: Release | null;
  previousTag: string | null;
  updateAvailable: boolean;
}) {
  const [notesExpanded, setNotesExpanded] = useState(true);

  if (!latestRelease) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon">
          <Tag className="h-5 w-5" />
        </span>
        <p className="empty-state-title">No releases yet</p>
        <p className="empty-state-copy">Run a check to find the latest release for this repository.</p>
      </div>
    );
  }

  const hasNotes = latestRelease.body && latestRelease.body.trim().length > 0;

  return (
    <div className="app-shell-card overflow-hidden">
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[var(--theme-divider)] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Latest Release
            </span>
            {updateAvailable && (
              <span className="status-pill status-pill--pending" style={{ background: "var(--theme-status-pending-bg)", color: "var(--color-status-warning)" }}>
                <span className="pulse-dot" />
                Update available
              </span>
            )}
            {latestRelease.prerelease && (
              <span className="status-pill status-pill--pending" style={{ background: "var(--theme-status-pending-bg)", color: "var(--color-status-warning)" }}>
                Pre-release
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <h2 className="text-[clamp(1.5rem,4vw,2.1rem)] font-bold tracking-tight text-[var(--color-text)] app-mono">
              {latestRelease.tagName}
            </h2>
            {latestRelease.name && latestRelease.name !== latestRelease.tagName && (
              <span className="text-sm text-[var(--color-text-muted)]">{latestRelease.name}</span>
            )}
          </div>
          {previousTag && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.82rem] text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text-faint)]">Previous:</span>
              <span className="app-mono text-[0.78rem]">{previousTag}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-[var(--color-status-success)]" />
              <span className="app-mono text-[0.78rem] text-[var(--color-status-success)]">{latestRelease.tagName}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {latestRelease.publishedAt && (
            <span className="inline-flex items-center gap-1.5 text-[0.78rem] text-[var(--color-text-muted)]">
              <Clock className="h-3.5 w-3.5" />
              {latestRelease.publishedAt.toLocaleDateString()}
            </span>
          )}
          <a
            href={latestRelease.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </div>

      {hasNotes ? (
        <>
          <button
            type="button"
            onClick={() => setNotesExpanded(!notesExpanded)}
            className="flex w-full items-center justify-between gap-2 border-b border-[var(--theme-divider)] px-5 py-2.5 text-left text-[0.78rem] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              Release Notes
            </span>
            {notesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {notesExpanded && (
            <div className="px-5 py-4 sm:px-6 sm:py-5 max-h-[600px] overflow-y-auto animate-fade-in">
              <ReleaseNotes body={latestRelease.body} />
            </div>
          )}
        </>
      ) : (
        <div className="px-5 py-6 text-center text-sm text-[var(--color-text-faint)]">
          No release notes for this version.
        </div>
      )}
    </div>
  );
}

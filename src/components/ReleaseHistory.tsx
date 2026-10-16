"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { BellOff, BellRing, ChevronDown, EyeOff, Tag } from "lucide-react";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { List, Panel, StatusDot, type StatusTone } from "@/components/ui/List";
import { EmptyState } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/time-ago";

export type ReleaseRow = {
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
  releaseType?: string | null;
};

type FilterKey = "all" | "stable" | "prerelease" | "major" | "ignored";

const FILTERS: Array<[FilterKey, string]> = [
  ["all", "All"],
  ["stable", "Stable"],
  ["prerelease", "Pre-release"],
  ["major", "Major"],
  ["ignored", "Ignored"],
];

function tone(release: ReleaseRow): StatusTone {
  if (release.ignored) return "neutral";
  if (release.prerelease) return "warning";
  if (release.releaseType === "major") return "accent";
  return "neutral";
}

function kind(release: ReleaseRow): string {
  if (release.prerelease) return "pre-release";
  return release.releaseType ?? "release";
}

/**
 * Release list.
 *
 * One row per release with an inline expander for the notes — no table, no
 * accordion of full-width cards.
 */
export function ReleaseHistory({ releases, appId }: { releases: ReleaseRow[]; appId?: string }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: releases.length,
      stable: releases.filter((r) => !r.prerelease && !r.ignored).length,
      prerelease: releases.filter((r) => r.prerelease).length,
      major: releases.filter((r) => r.releaseType === "major").length,
      ignored: releases.filter((r) => r.ignored).length,
    }),
    [releases]
  );

  const visible = releases.filter((release) => {
    if (filter === "stable") return !release.prerelease && !release.ignored;
    if (filter === "prerelease") return release.prerelease;
    if (filter === "major") return release.releaseType === "major";
    if (filter === "ignored") return release.ignored;
    return true;
  });

  if (releases.length === 0) {
    return (
      <EmptyState
        icon={<Tag className="h-4 w-4" />}
        title="No releases recorded yet"
        description="Once this repository publishes a release, it appears here with its notes."
      />
    );
  }

  return (
    <Panel
      title="Releases"
      description="Newest first. Expand a release to read its notes."
      actions={
        <>
          <StatusDot tone="neutral">{visible.length} shown</StatusDot>
        </>
      }
      flush
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="chip-row" role="group" aria-label="Filter releases">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="chip"
              data-active={filter === key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              disabled={counts[key] === 0 && key !== "all"}
            >
              {label}
              <span className="mono text-2xs opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">No releases match this filter.</p>
      ) : (
        <List>
          {visible.map((release) => {
            const expanded = expandedId === release.id;
            return (
              <Fragment key={release.id}>
                <li className={cn("transition-colors", expanded ? "bg-surface" : "hover:bg-surface")}>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : release.id)}
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "Hide" : "Show"} notes for ${release.tagName}`}
                      className="icon-button mt-0.5 shrink-0"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {appId && !release.id.startsWith("github-") ? (
                          <Link
                            href={`/apps/${appId}/releases/${release.id}`}
                            className="mono truncate text-sm font-medium text-text transition-colors hover:text-accent"
                          >
                            {release.tagName}
                          </Link>
                        ) : (
                          <span className="mono truncate text-sm font-medium text-text">{release.tagName}</span>
                        )}
                        <StatusDot tone={tone(release)}>{kind(release)}</StatusDot>
                        {release.draft && <StatusDot tone="neutral">draft</StatusDot>}
                      </div>
                      {release.name && release.name !== release.tagName && (
                        <p className="mt-0.5 truncate text-xs text-text-muted">{release.name}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint">
                        <span>
                          published{" "}
                          {release.publishedAt ? formatRelativeTime(release.publishedAt) : "unknown"}
                        </span>
                        <span>detected {formatRelativeTime(release.detectedAt)}</span>
                        {release.notificationSent ? (
                          <span className="inline-flex items-center gap-1 text-status-success">
                            <BellRing className="h-3 w-3" aria-hidden="true" /> notified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <BellOff className="h-3 w-3" aria-hidden="true" /> not notified
                          </span>
                        )}
                        {release.ignored && (
                          <span className="inline-flex items-center gap-1">
                            <EyeOff className="h-3 w-3" aria-hidden="true" /> ignored
                          </span>
                        )}
                      </div>
                    </div>

                    <a
                      href={release.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--subtle btn--sm shrink-0"
                    >
                      GitHub
                    </a>
                  </div>

                  {expanded && (
                    <div className="border-t border-border bg-surface px-4 py-4 sm:pl-14">
                      {release.body ? (
                        <ReleaseNotes body={release.body} />
                      ) : (
                        <p className="text-sm text-text-muted">This release has no notes.</p>
                      )}
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </List>
      )}
    </Panel>
  );
}
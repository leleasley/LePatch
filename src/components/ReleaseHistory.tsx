"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BellRing,
  BellOff,
  ChevronDown,
  Clock,
  EyeOff,
  Filter,
  Tag,
} from "lucide-react";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { Badge } from "@/components/ui/Card";
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

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  stable: "Stable",
  prerelease: "Pre-release",
  major: "Major",
  ignored: "Ignored",
};

function severityTone(release: ReleaseRow): "accent" | "warning" | "neutral" | "danger" {
  if (release.ignored) return "neutral";
  if (release.prerelease) return "warning";
  if (release.releaseType === "major") return "accent";
  return "neutral";
}

function severityLabel(release: ReleaseRow): string {
  if (release.prerelease) return "pre-release";
  return release.releaseType ?? "release";
}

/**
 * Dense release table.
 *
 * Replaces an accordion of full-width cards: scan the list, then expand one row
 * for the notes. Filters and a proper table header make the data readable and
 * keyboard traversable.
 */
export function ReleaseHistory({ releases }: { releases: ReleaseRow[] }) {
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
      <div className="empty-state">
        <span className="empty-state-icon">
          <Tag className="h-4 w-4" />
        </span>
        <p className="empty-state-title">No releases stored yet</p>
        <p className="empty-state-copy">Run a check to populate release history for this repository.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <Filter className="h-3.5 w-3.5 text-text-faint" aria-hidden="true" />
        <div className="chip-row" role="group" aria-label="Filter releases">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className="chip"
              data-active={filter === key}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              disabled={counts[key] === 0 && key !== "all"}
            >
              {FILTER_LABELS[key]}
              <span className="mono text-2xs opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-faint">
          {visible.length} of {releases.length} shown
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-muted">No releases match this filter.</p>
      ) : (
        <table className="data-table">
          <caption className="sr-only">Releases for this repository</caption>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              <th scope="col">Type</th>
              <th scope="col">Published</th>
              <th scope="col">Detected</th>
              <th scope="col">Notified</th>
              <th scope="col" className="text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((release) => {
              const expanded = expandedId === release.id;
              return (
                <Fragment key={release.id}>
                  <tr className={cn(release.ignored && "opacity-60")}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : release.id)}
                        aria-expanded={expanded}
                        className="flex items-center gap-1.5 text-left"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("h-3.5 w-3.5 shrink-0 text-text-faint transition-transform", expanded && "rotate-180")}
                        />
                        <span className="mono text-sm font-medium text-text">{release.tagName}</span>
                      </button>
                      {release.name && release.name !== release.tagName && (
                        <span className="mt-0.5 block truncate pl-5 text-xs text-text-muted">{release.name}</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={severityTone(release)} dot>
                        {severityLabel(release)}
                      </Badge>
                      {release.draft && (
                        <Badge tone="neutral" className="ml-1">
                          draft
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-text-muted">
                      <time dateTime={release.publishedAt?.toISOString()}>
                        {release.publishedAt ? formatRelativeTime(release.publishedAt) : "unknown"}
                      </time>
                    </td>
                    <td className="whitespace-nowrap text-text-muted">
                      <time dateTime={release.detectedAt.toISOString()}>{formatRelativeTime(release.detectedAt)}</time>
                    </td>
                    <td>
                      {release.notificationSent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-status-success">
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-text-faint">
                          <BellOff className="h-3.5 w-3.5" aria-hidden="true" /> pending
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <a
                        href={release.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--subtle btn--sm"
                      >
                        GitHub
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={6} className="bg-surface px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          Detected {formatRelativeTime(release.detectedAt)}
                          {release.ignored && (
                            <span className="inline-flex items-center gap-1 text-text-faint">
                              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> ignored
                            </span>
                          )}
                        </div>
                        <div className="mt-3 max-h-96 overflow-y-auto">
                          {release.body ? (
                            <ReleaseNotes body={release.body} />
                          ) : (
                            <p className="text-sm text-text-muted">This release has no notes.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
"use client";

import { useState } from "react";
import { ExternalLink, Tag, Clock, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { EmptyState } from "@/components/ui/Card";
import { Panel, StatusDot } from "@/components/ui/List";

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
      <Panel title="Latest release" flush>
        <div className="p-4">
          <EmptyState
            icon={<Tag className="h-4 w-4" />}
            title="No releases yet"
            description="Run a check to find the latest release for this repository."
          />
        </div>
      </Panel>
    );
  }

  const hasNotes = Boolean(latestRelease.body && latestRelease.body.trim().length > 0);
  const hasName = Boolean(latestRelease.name && latestRelease.name !== latestRelease.tagName);
  const hasMeta = hasName || Boolean(previousTag);

  return (
    <Panel
      flush
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="mono text-base text-text">{latestRelease.tagName}</span>
          {updateAvailable && (
            <StatusDot tone="warning" pulse>
              Update available
            </StatusDot>
          )}
          {latestRelease.prerelease && <StatusDot tone="warning">Pre-release</StatusDot>}
        </span>
      }
      actions={
        <>
          {latestRelease.publishedAt && (
            <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <time dateTime={latestRelease.publishedAt.toISOString()}>
                {latestRelease.publishedAt.toLocaleDateString()}
              </time>
            </span>
          )}
          <a
            href={latestRelease.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary btn--sm"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            GitHub
          </a>
        </>
      }
    >
      {hasMeta && (
        <div className="px-4 py-3">
          {hasName && <p className="text-sm text-text-muted">{latestRelease.name}</p>}
          {previousTag && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-faint">
              <span>Previous</span>
              <span className="mono">{previousTag}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
              <span className="mono text-status-success">{latestRelease.tagName}</span>
            </div>
          )}
        </div>
      )}

      {hasNotes ? (
        <>
          <button
            type="button"
            onClick={() => setNotesExpanded((v) => !v)}
            aria-expanded={notesExpanded}
            className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-medium text-text-muted transition-colors hover:bg-surface ${hasMeta ? "border-t border-border" : ""}`}
          >
            <span>Release notes</span>
            {notesExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          {notesExpanded && (
            <div className="max-h-[600px] overflow-y-auto border-t border-border px-4 py-4">
              <ReleaseNotes body={latestRelease.body} />
            </div>
          )}
        </>
      ) : (
        <p className={`px-4 py-4 text-sm text-text-faint ${hasMeta ? "border-t border-border" : ""}`}>
          No release notes for this version.
        </p>
      )}
    </Panel>
  );
}

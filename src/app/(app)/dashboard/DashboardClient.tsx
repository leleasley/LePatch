"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState } from "@/components/ui/Card";
import { useDashboard } from "@/lib/use-swr";
import { formatRelativeTime } from "@/lib/time-ago";

type FeedItem = {
  id: string;
  tagName: string;
  name: string | null;
  htmlUrl: string;
  prerelease: boolean;
  publishedAt: Date | null;
  detectedAt: Date | string;
  changelogSummary: string | null;
  watchedApp: { id: string; name: string; repoFullName: string };
};

function ownerOf(repoFullName: string): string {
  return repoFullName.split("/")[0] ?? repoFullName;
}

/** Real owner avatar with a letter fallback if it fails to load. */
function OwnerAvatar({ owner, name }: { owner: string; name: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-elevated text-xs font-semibold text-text-muted"
    >
      {name.slice(0, 1).toUpperCase()}
      <img
        src={`https://github.com/${owner}.png?size=72`}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  );
}

function dayKey(value: Date | string): string {
  return new Date(value).toDateString();
}

function dayLabel(value: Date | string): string {
  const date = new Date(value);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function ReleaseEntry({ release }: { release: FeedItem }) {
  const owner = ownerOf(release.watchedApp.repoFullName);
  const title = release.name && release.name !== release.tagName ? release.name : null;

  return (
    <article className="flex gap-3.5 py-5 first:pt-1 last:pb-1">
      <OwnerAvatar owner={owner} name={release.watchedApp.name} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link
            href={`/apps/${release.watchedApp.id}`}
            className="truncate text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            {release.watchedApp.name}
          </Link>
          <Link
            href={`/apps/${release.watchedApp.id}/releases`}
            className="mono text-sm font-semibold text-accent hover:underline"
          >
            {release.tagName}
          </Link>
          {release.prerelease && (
            <span className="rounded-full bg-status-warning/10 px-2 py-px text-2xs font-semibold text-status-warning">
              pre-release
            </span>
          )}
        </div>

        {title && <p className="mt-0.5 truncate text-sm text-text">{title}</p>}

        {release.changelogSummary ? (
          <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-text-muted">{release.changelogSummary}</p>
        ) : (
          <p className="mt-1 text-sm text-text-faint">No release notes published.</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-faint">
          <span>{formatRelativeTime(release.detectedAt)}</span>
          <span className="mono">{owner}/{release.watchedApp.repoFullName.split("/")[1] ?? ""}</span>
          <Link href={`/apps/${release.watchedApp.id}/releases`} className="transition-colors hover:text-accent">
            Release notes
          </Link>
          <a href={release.htmlUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">
            GitHub
          </a>
        </div>
      </div>
    </article>
  );
}

/**
 * Home feed: what shipped, newest first, grouped by day.
 *
 * This page used to be a monitoring console (metrics, attention lists, health
 * panels). LePatch is a reader — the only question that matters here is what
 * changed in the repositories you watch.
 */
export function DashboardClient({
  initialData,
}: {
  initialData: { total: number; updates: number; failed: number; stale: number; recent: FeedItem[] };
}) {
  const { data, error } = useDashboard();
  const d = data ?? initialData;

  const groups = useMemo(() => {
    const ordered: Array<{ key: string; label: string; items: FeedItem[] }> = [];
    const byKey = new Map<string, { label: string; items: FeedItem[] }>();
    for (const release of d.recent) {
      const key = dayKey(release.detectedAt);
      let group = byKey.get(key);
      if (!group) {
        group = { label: dayLabel(release.detectedAt), items: [] };
        byKey.set(key, group);
        ordered.push({ key, ...group });
      }
      group.items.push(release);
    }
    return ordered;
  }, [d.recent]);

  const ops: Array<{ label: string; href: string }> = [];
  if (d.failed > 0) ops.push({ label: `${d.failed} check${d.failed === 1 ? "" : "s"} failing`, href: "/apps?filter=failed" });
  if (d.updates > 0) ops.push({ label: `${d.updates} update${d.updates === 1 ? "" : "s"} waiting`, href: "/apps?filter=updates" });
  if (d.stale > 0) ops.push({ label: `${d.stale} repositor${d.stale === 1 ? "y" : "ies"} stale`, href: "/apps?filter=attention" });

  return (
    <>
      <PageHeader
        title="Feed"
        description={
          d.total === 0
            ? "Releases from the repositories you watch will appear here."
            : `Latest releases from the ${d.total} repositor${d.total === 1 ? "y" : "ies"} you watch.`
        }
        actions={
          d.total === 0 ? (
            <Link href="/apps/search" className="btn btn--primary btn--sm">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Find repositories
            </Link>
          ) : (
            <>
              <Link href="/apps/search" className="btn btn--ghost btn--sm">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                Find repositories
              </Link>
              <Link href="/apps" className="btn btn--primary btn--sm">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Watched repositories
              </Link>
            </>
          )
        }
      />

      {error && (
        <div className="mb-6">
          <ErrorState
            title="Live updates unavailable"
            description="Showing the releases loaded with the page. Retrying automatically."
          />
        </div>
      )}

      {d.total === 0 ? (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="You're not watching anything yet"
          description="Add a repository and its releases will show up here the moment they ship."
          action={
            <Link href="/apps/search" className="btn btn--primary btn--sm">
              Find repositories
            </Link>
          }
        />
      ) : d.recent.length === 0 ? (
        <EmptyState
          title="No releases detected yet"
          description="LePatch checks every watched repository on a schedule. New releases appear here automatically."
          action={
            <Link href="/apps" className="btn btn--ghost btn--sm">
              Review watched repositories
            </Link>
          }
        />
      ) : (
        <div className="max-w-3xl">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label} className="mb-2">
              <h2 className="sticky top-0 border-b border-border bg-canvas/95 py-2 text-xs font-semibold uppercase tracking-wide text-text-faint backdrop-blur-sm">
                {group.label}
              </h2>
              <div className="divide-y divide-divider">
                {group.items.map((release) => (
                  <ReleaseEntry key={release.id} release={release} />
                ))}
              </div>
            </section>
          ))}

          <p className="mt-6 border-t border-border pt-4 text-xs text-text-faint">
            Showing the {d.recent.length} most recent release{d.recent.length === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {ops.length > 0 && (
        <p className="mt-6 border-t border-border pt-4 text-xs text-text-faint">
          {ops.map((item, index) => (
            <span key={item.label}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              <Link href={item.href} className="transition-colors hover:text-status-warning">
                {item.label}
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

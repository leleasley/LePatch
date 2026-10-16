"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BellOff,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { PageHeader, MetaItem } from "@/components/ui/PageHeader";
import { List, ListRow, MetricStrip, Panel, RowAvatar, StatusDot } from "@/components/ui/List";
import { EmptyState, ErrorState } from "@/components/ui/Card";
import { useDashboard } from "@/lib/use-swr";
import { formatRelativeTime } from "@/lib/time-ago";

type DashboardData = {
  total: number;
  updates: number;
  failed: number;
  recent: Array<{
    id: string;
    tagName: string;
    name: string | null;
    htmlUrl: string;
    prerelease: boolean;
    publishedAt: Date | null;
    detectedAt: Date;
    watchedApp: { id: string; name: string; repoFullName: string; updateAvailable: boolean };
  }>;
  lastCheckedAt: Date | null;
  pendingEvents: number;
  successCount: number;
  noReleasesCount: number;
  recentlyCheckedCount: number;
  releasesThisWeek: number;
  prereleasesThisWeek: number;
  activity: Array<{ date: string; label: string; count: number; prereleases: number }>;
  prereleases: Array<{
    id: string;
    tagName: string;
    name: string | null;
    htmlUrl: string;
    publishedAt: Date | null;
    detectedAt: Date;
    watchedApp: { id: string; name: string; repoFullName: string };
  }>;
  mostActive: Array<{ watchedAppId: string; name: string; repoFullName: string; releaseCount: number }>;
  notificationsDisabled: number;
  staleApps: number;
  attentionApps: Array<{
    id: string;
    name: string;
    repoFullName: string;
    latestSeenTag: string | null;
    lastCheckedAt: Date | null;
    checkStatus: string;
    checkError: string | null;
    updateAvailable: boolean;
    notificationsEnabled: boolean;
    includePrereleases: boolean;
    updatedAt: Date;
  }>;
  neverChecked: number;
  statusHealthy: boolean;
  lastCheckContext: string;
};

const STALE_MS = 24 * 60 * 60 * 1000;

function toMs(value: Date | string | null): number | null {
  if (!value) return null;
  const ms = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isStale(lastCheckedAt: Date | null): boolean {
  const ms = toMs(lastCheckedAt);
  return ms === null || Date.now() - ms > STALE_MS;
}

function attentionRank(app: DashboardData["attentionApps"][number]): number {
  if (app.checkStatus === "failed") return 0;
  if (app.updateAvailable) return 1;
  if (!app.notificationsEnabled) return 2;
  if (isStale(app.lastCheckedAt)) return 3;
  return 4;
}

function ActivityBars({ activity }: { activity: DashboardData["activity"] }) {
  const max = Math.max(1, ...activity.map((day) => day.count));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Releases detected per day over the last seven days">
      {activity.map((day) => (
        <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${day.date}: ${day.count} release${day.count === 1 ? "" : "s"}`}>
          <div className="flex h-20 w-full items-end rounded-sm bg-surface">
            <div
              className={day.count > 0 ? "w-full rounded-sm bg-accent" : "w-full rounded-sm bg-border/50"}
              style={{ height: `${Math.max(day.count > 0 ? 12 : 6, (day.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-2xs uppercase text-text-faint">{day.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const { data, error } = useDashboard();
  const d = data ?? initialData;
  const attention = [...d.attentionApps].sort((a, b) => attentionRank(a) - attentionRank(b));

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          d.total === 0
            ? "Watch a repository and LePatch will track its releases for you."
            : `Tracking ${d.total} repositor${d.total === 1 ? "y" : "ies"}. ${d.lastCheckContext}.`
        }
        meta={
          <>
            <MetaItem icon={<Clock className="h-3.5 w-3.5" />}>
              Last check {d.lastCheckedAt ? formatRelativeTime(d.lastCheckedAt) : "never run"}
            </MetaItem>
            <MetaItem icon={<CalendarDays className="h-3.5 w-3.5" />}>
              {d.releasesThisWeek} release{d.releasesThisWeek === 1 ? "" : "s"} this week
            </MetaItem>
          </>
        }
        actions={
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
        }
      />

      <div className="mb-6">
        <MetricStrip
          items={[
            { label: "Watched", value: d.total },
            { label: "Updates waiting", value: d.updates, tone: d.updates > 0 ? "warning" : undefined },
            { label: "Releases this week", value: d.releasesThisWeek, tone: "success" },
            { label: "Failed checks", value: d.failed, tone: d.failed > 0 ? "danger" : undefined },
          ]}
        />
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState
            title="Live data unavailable"
            description="Showing the last values loaded with the page. Retrying automatically."
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Panel
          title="Needs attention"
          description="Failed checks, unacknowledged releases and muted repositories."
          actions={
            <Link href="/apps?filter=attention" className="text-xs text-accent hover:underline">
              View all
            </Link>
          }
          flush
        >
          {attention.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="Everything is up to date"
                description="No failed checks, stale repositories or muted apps right now."
              />
            </div>
          ) : (
            <List>
              {attention.map((app) => {
                const stale = isStale(app.lastCheckedAt);
                const tone = app.checkStatus === "failed"
                  ? "danger"
                  : app.updateAvailable
                    ? "warning"
                    : "neutral";
                const label = app.checkStatus === "failed"
                  ? "Check failed"
                  : app.updateAvailable
                    ? "Update available"
                    : !app.notificationsEnabled
                      ? "Muted"
                      : stale
                        ? "Stale"
                        : "Up to date";
                return (
                  <ListRow
                    key={app.id}
                    href={`/apps/${app.id}`}
                    leading={<RowAvatar tone={tone}>{app.name.slice(0, 1).toUpperCase()}</RowAvatar>}
                    title={
                      <>
                        <span className="truncate text-sm font-medium text-text">{app.name}</span>
                        <StatusDot tone={tone}>{label}</StatusDot>
                      </>
                    }
                    subtitle={app.repoFullName}
                    meta={
                      <>
                        <span className="mono">{app.latestSeenTag ?? "no release yet"}</span>
                        {app.lastCheckedAt && <span>checked {formatRelativeTime(app.lastCheckedAt)}</span>}
                        {app.checkError && app.checkStatus === "failed" && (
                          <span className="text-status-danger">{app.checkError}</span>
                        )}
                      </>
                    }
                  />
                );
              })}
            </List>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel
            title="Recent releases"
            description="Newest detections across every watched repository."
            actions={
              <Link href="/apps" className="text-xs text-accent hover:underline">
                All repositories
              </Link>
            }
            flush
          >
            {d.recent.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Sparkles className="h-4 w-4" />}
                  title="No releases detected yet"
                  description="Releases appear here as soon as LePatch spots them."
                />
              </div>
            ) : (
              <List className="max-h-96 overflow-y-auto">
                {d.recent.map((release) => (
                  <ListRow
                    key={release.id}
                    href={`/apps/${release.watchedApp.id}?tab=releases`}
                    title={
                      <>
                        <span className="mono truncate text-sm font-medium text-accent">{release.tagName}</span>
                        {release.prerelease && <StatusDot tone="warning">pre-release</StatusDot>}
                      </>
                    }
                    subtitle={`${release.watchedApp.name} · ${release.watchedApp.repoFullName}`}
                    meta={<span>{formatRelativeTime(release.detectedAt)}</span>}
                  />
                ))}
              </List>
            )}
          </Panel>

          <Panel title="Release activity" description="Detections over the last seven days.">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums text-text">{d.releasesThisWeek}</span>
              <span className="text-xs text-text-muted">
                {d.prereleasesThisWeek} pre-release{d.prereleasesThisWeek === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4">
              <ActivityBars activity={d.activity} />
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Pre-release spotlight" description="Beta and release-candidate tags tracked recently." flush>
          {d.prereleases.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              Enable pre-releases on a repository to surface them here.
            </p>
          ) : (
            <List>
              {d.prereleases.map((release) => (
                <ListRow
                  key={release.id}
                  href={`/apps/${release.watchedApp.id}?tab=releases`}
                  title={<span className="mono text-sm font-medium text-status-warning">{release.tagName}</span>}
                  subtitle={`${release.watchedApp.name} · ${release.watchedApp.repoFullName}`}
                  meta={<span>{formatRelativeTime(release.detectedAt)}</span>}
                />
              ))}
            </List>
          )}
        </Panel>

        <Panel title="Most active repositories" description="Ranked by releases detected." flush>
          {d.mostActive.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">Nothing tracked yet.</p>
          ) : (
            <List>
              {d.mostActive.map((row) => (
                <ListRow
                  key={row.watchedAppId}
                  href={`/apps/${row.watchedAppId}?tab=releases`}
                  leading={<RowAvatar tone="accent">{row.releaseCount > 99 ? "99" : row.releaseCount}</RowAvatar>}
                  title={<span className="truncate text-sm font-medium text-text">{row.name}</span>}
                  subtitle={row.repoFullName}
                />
              ))}
            </List>
          )}
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Notifications" description="Delivery health across your channels.">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Pending deliveries</dt>
              <dd className="font-medium tabular-nums text-text">{d.pendingEvents}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Muted repositories</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium tabular-nums text-text">
                {d.notificationsDisabled > 0 && <BellOff className="h-3.5 w-3.5 text-text-faint" aria-hidden="true" />}
                {d.notificationsDisabled}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Stale repositories</dt>
              <dd className="font-medium tabular-nums text-text">{d.staleApps}</dd>
            </div>
            <Link href="/profile/notifications" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              Notification preferences
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </dl>
        </Panel>

        <Panel title="Checks" description="Scheduler health for your watch list.">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Checks passing</dt>
              <dd className="font-medium tabular-nums text-status-success">{d.successCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">No releases published</dt>
              <dd className="font-medium tabular-nums text-text">{d.noReleasesCount}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Never checked</dt>
              <dd className="font-medium tabular-nums text-text">{d.neverChecked}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Checked in the last hour</dt>
              <dd className="font-medium tabular-nums text-text">
                {d.recentlyCheckedCount} / {d.total}
              </dd>
            </div>
            {d.failed > 0 && (
              <p className="inline-flex items-center gap-1.5 text-xs text-status-danger">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {d.failed} repository checks are failing.
              </p>
            )}
            <Link href="/admin/logs" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Queues and logs
            </Link>
          </dl>
        </Panel>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-text-faint" aria-hidden="true" />
          {d.mostActive[0]?.name ?? "No repository"} is the most active this period.
        </span>
        <Link href="/apps" className="text-accent hover:underline">
          Manage watched repositories
        </Link>
      </div>
    </>
  );
}
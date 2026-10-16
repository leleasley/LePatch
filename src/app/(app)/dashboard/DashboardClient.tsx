"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  FlaskConical,
  Gauge,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/Badge";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import { useDashboard } from "@/lib/use-swr";

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
    watchedApp: {
      id: string;
      name: string;
      repoFullName: string;
      updateAvailable: boolean;
    };
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

const staleThresholdMs = 24 * 60 * 60 * 1000;

function toTimestamp(value: Date | string | null): number | null {
  if (!value) return null;
  const timestamp = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatCount(count: number): string {
  return count.toLocaleString();
}

function isStaleApp(app: DashboardData["attentionApps"][number]): boolean {
  const timestamp = toTimestamp(app.lastCheckedAt);
  if (timestamp === null) return true;
  return Date.now() - timestamp > staleThresholdMs;
}

function appPriority(app: DashboardData["attentionApps"][number]): number {
  if (app.checkStatus === "failed") return 0;
  if (app.updateAvailable) return 1;
  if (!app.notificationsEnabled) return 2;
  const timestamp = toTimestamp(app.lastCheckedAt);
  if (timestamp === null) return 3;
  if (Date.now() - timestamp > staleThresholdMs) return 4;
  return 5;
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-text-muted",
    accent: "text-accent",
    success: "text-status-success",
    warning: "text-status-pending",
    danger: "text-status-failure",
  }[tone];

  return (
    <Card padding="none" className="flex items-start gap-3 p-4">
      <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-surface ${toneClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-text-faint">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-text">{value}</div>
        {hint && <div className="mt-0.5 truncate text-xs text-text-muted">{hint}</div>}
      </div>
    </Card>
  );
}

function ActivityStrip({ activity }: { activity: DashboardData["activity"] }) {
  const max = Math.max(1, ...activity.map((day) => day.count));
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label="Releases detected per day over the last 7 days">
      {activity.map((day) => (
        <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${day.date}: ${day.count} release${day.count === 1 ? "" : "s"}`}>
          <div className="flex h-24 w-full items-end rounded-md bg-surface">
            <div
              className={`w-full rounded-md ${day.count > 0 ? "bg-accent" : "bg-border/40"}`}
              style={{ height: `${Math.max(day.count > 0 ? 10 : 5, (day.count / max) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] uppercase text-text-faint">{day.label}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const { data } = useDashboard();
  const d = data || initialData;
  const attentionApps = [...d.attentionApps].sort((a, b) => appPriority(a) - appPriority(b));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Overview</h1>
          <p className="mt-1 text-sm text-text-muted">
            {d.total === 0
              ? "Watch your first repository to start tracking releases."
              : `Tracking ${formatCount(d.total)} repositor${d.total === 1 ? "y" : "ies"}. ${d.lastCheckContext}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/apps/search"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 text-sm font-medium text-text transition-colors hover:border-accent/50"
          >
            <Search className="h-4 w-4 text-text-muted" />
            Add repository
          </Link>
          <Link
            href="/apps"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Boxes className="h-4 w-4" />
            Watched apps
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Watched repos" value={formatCount(d.total)} hint="Repositories tracked" icon={<Gauge className="h-4 w-4" />} />
        <MetricCard
          label="Updates"
          value={formatCount(d.updates)}
          hint={d.updates > 0 ? "New releases waiting" : "Nothing waiting"}
          tone={d.updates > 0 ? "warning" : "neutral"}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <MetricCard label="Releases this week" value={formatCount(d.releasesThisWeek)} hint={`${d.prereleasesThisWeek} pre-release(s) included`} tone="success" icon={<CalendarDays className="h-4 w-4" />} />
        <MetricCard
          label="Failed checks"
          value={formatCount(d.failed)}
          hint={d.failed > 0 ? "Needs attention" : "All healthy"}
          tone={d.failed > 0 ? "danger" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Card padding="none" className="overflow-hidden">
          <CardHeader>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-faint">Attention required</div>
              <CardTitle className="mt-1 text-base">Apps needing action</CardTitle>
            </div>
            <Link href="/apps" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              All apps
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          {attentionApps.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="Everything is healthy"
                description="No failed checks, stale repos, or muted apps right now."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {attentionApps.map((app) => {
                const isStale = isStaleApp(app);
                const label = app.checkStatus === "failed"
                  ? "Check failed"
                  : app.updateAvailable
                    ? "Update available"
                    : !app.notificationsEnabled
                      ? "Notifications off"
                      : isStale
                        ? "Stale"
                        : "Watching";
                const variant = app.checkStatus === "failed" ? "error" : app.updateAvailable ? "warning" : "neutral";

                return (
                  <li key={app.id}>
                    <Link href={`/apps/${app.id}`} className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-elevated/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-text">{app.name}</span>
                          <Badge variant={variant as "error" | "warning" | "neutral"} dot>{label}</Badge>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-text-muted">{app.repoFullName}</div>
                        {app.checkError && app.checkStatus === "failed" && (
                          <div className="mt-1 truncate text-xs text-status-failure">{app.checkError}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-text-faint">
                        <div className="font-mono text-text-muted">{app.latestSeenTag || "no release yet"}</div>
                        <LiveTimestamp date={app.lastCheckedAt} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card padding="none" className="overflow-hidden">
            <CardHeader>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-text-faint">Latest detections</div>
                <CardTitle className="mt-1 text-base">Recent releases</CardTitle>
              </div>
              <Link href="/apps" className="text-sm text-accent hover:underline">All</Link>
            </CardHeader>
            {d.recent.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Plus className="h-5 w-5" />}
                  title="No releases yet"
                  description="Add a repository and LePatch will start detecting releases."
                />
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {d.recent.map((release) => (
                  <li key={release.id}>
                    <Link href={`/apps/${release.watchedApp.id}/releases`} className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-surface-elevated/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-text">{release.watchedApp.name}</span>
                          <span className="truncate font-mono text-xs text-accent">{release.tagName}</span>
                          {release.prerelease && <Badge variant="warning">Pre-release</Badge>}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-text-muted">{release.watchedApp.repoFullName}</div>
                      </div>
                      <div className="shrink-0 text-xs text-text-faint">
                        <LiveTimestamp date={release.detectedAt} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-text-faint">Last 7 days</div>
                <CardTitle className="mt-1 text-base">Release activity</CardTitle>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-text">{formatCount(d.releasesThisWeek)}</span>
            </div>
            <div className="mt-4">
              <ActivityStrip activity={d.activity} />
            </div>
            <p className="mt-3 text-xs text-text-faint">{d.lastCheckContext}</p>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card padding="none" className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-status-pending" />
              <CardTitle className="text-base">Pre-release spotlight</CardTitle>
            </div>
            <span className="text-xs text-text-faint">Beta &amp; RC</span>
          </CardHeader>
          {d.prereleases.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No pre-releases tracked" description="Enable “Include prereleases” on an app to surface them here." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {d.prereleases.map((release) => (
                <li key={release.id}>
                  <Link href={`/apps/${release.watchedApp.id}/releases`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-text">
                        {release.watchedApp.name} <span className="font-mono text-status-pending">{release.tagName}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-text-muted">{release.watchedApp.repoFullName}</div>
                    </div>
                    <LiveTimestamp date={release.detectedAt} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="none" className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-status-pending" />
              <CardTitle className="text-base">Most active repos</CardTitle>
            </div>
          </CardHeader>
          {d.mostActive.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Nothing tracked yet" description="Release volume per repository will appear here." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {d.mostActive.map((row) => (
                <li key={row.watchedAppId}>
                  <Link href={`/apps/${row.watchedAppId}/releases`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-elevated/60">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text">{row.name}</div>
                      <div className="mt-0.5 truncate text-xs text-text-muted">{row.repoFullName}</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-text-muted">
                      {row.releaseCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Pending notifications", value: d.pendingEvents, href: "/notifications" },
          { label: "Stale apps", value: d.staleApps, href: "/apps?filter=stale" },
          { label: "Notifications off", value: d.notificationsDisabled, href: "/apps?filter=notificationsOff" },
          { label: "Never checked", value: d.neverChecked, href: "/apps?filter=stale" },
        ].map((tile) => (
          <Link key={tile.label} href={tile.href} className="rounded-xl border border-border bg-surface-elevated/60 p-4 transition-colors hover:border-accent/50">
            <div className="text-xs font-medium uppercase tracking-wide text-text-faint">{tile.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-text">{formatCount(tile.value)}</div>
          </Link>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Link href="/apps/search" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-colors hover:border-accent/50">
          <Plus className="h-4 w-4 text-text-muted" />
          Add repository
        </Link>
        <Link href="/notifications" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-colors hover:border-accent/50">
          <Bell className="h-4 w-4 text-text-muted" />
          Notification centre
        </Link>
        <Link href="/admin/logs" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-colors hover:border-accent/50">
          <RefreshCw className="h-4 w-4 text-text-muted" />
          Queues &amp; logs
        </Link>
        <Link href="/apps" className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-colors hover:border-accent/50">
          <Clock className="h-4 w-4 text-text-muted" />
          Watched apps
        </Link>
      </section>
    </div>
  );
}
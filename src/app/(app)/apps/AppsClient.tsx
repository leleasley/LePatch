"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BellOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { AddAppButton } from "@/components/AddAppButton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/Card";
import { List, ListRow, MetricStrip, RowAvatar, StatusDot, Toolbar, type StatusTone } from "@/components/ui/List";
import { Input, Select } from "@/components/ui/Input";
import { useApps } from "@/lib/use-swr";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";
import { RelativeTime } from "@/components/RelativeTime";
import { cn } from "@/lib/cn";
import { removeWatchedApp, updateWatchedApp } from "@/lib/apps-ui-state";

export type WatchedAppRow = {
  id: string;
  name: string;
  repoFullName: string;
  latestSeenTag: string | null;
  lastCheckedAt: string | null;
  checkStatus: string;
  updateAvailable: boolean;
  notificationsEnabled: boolean;
  includePrereleases: boolean;
};

type FilterKey = "all" | "attention" | "updates" | "failed" | "muted" | "fresh";
type SortKey = "attention" | "name" | "checked";

const STALE_MS = 24 * 60 * 60 * 1000;

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isStale(app: WatchedAppRow): boolean {
  const ms = timestamp(app.lastCheckedAt);
  return ms === null || Date.now() - ms > STALE_MS;
}

function attentionScore(app: WatchedAppRow): number {
  if (app.checkStatus === "failed") return 0;
  if (app.updateAvailable) return 1;
  if (!app.notificationsEnabled) return 2;
  if (isStale(app)) return 3;
  return 4;
}

/** One status per row, described in words rather than three stacked pills. */
function status(app: WatchedAppRow): { tone: StatusTone; label: string } {
  if (app.checkStatus === "failed") return { tone: "danger", label: "Check failed" };
  if (app.updateAvailable) return { tone: "warning", label: "Update available" };
  if (!app.notificationsEnabled) return { tone: "neutral", label: "Muted" };
  if (isStale(app)) return { tone: "neutral", label: "Stale" };
  if (app.checkStatus === "no_releases") return { tone: "neutral", label: "No releases" };
  return { tone: "success", label: "Up to date" };
}

export function AppsClient({
  initialApps,
  initialTotal,
  initialFilter = "all",
  watchedApps = [],
  canAdd = true,
}: {
  initialApps: WatchedAppRow[];
  initialTotal: number;
  initialFilter?: FilterKey;
  watchedApps?: { id: string; repoFullName: string }[];
  canAdd?: boolean;
}) {
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>(initialFilter);
  const [sortBy, setSortBy] = useState<SortKey>("attention");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkingIds, setCheckingIds] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<WatchedAppRow | null>(null);
  const { data, error, isLoading, isValidating, mutate, size, setSize } = useApps({
    apps: initialApps,
    total: initialTotal,
    page: 1,
    perPage: 200,
  });
  const apps: WatchedAppRow[] = (data?.flatMap((page) => page.apps) as WatchedAppRow[] | undefined) ?? initialApps;
  const total = data?.[0]?.total ?? initialTotal;
  const hasMore = apps.length < total;

  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const counts = useMemo(
    () => ({
      all: total,
      attention: apps.filter((app) => attentionScore(app) < 4).length,
      updates: apps.filter((app) => app.updateAvailable).length,
      failed: apps.filter((app) => app.checkStatus === "failed").length,
      muted: apps.filter((app) => !app.notificationsEnabled).length,
      fresh: apps.filter((app) => !isStale(app) && app.checkStatus === "success").length,
    }),
    [apps, total]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (app: WatchedAppRow) => {
      if (q && !`${app.name} ${app.repoFullName} ${app.latestSeenTag ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "attention") return attentionScore(app) < 4;
      if (filter === "updates") return app.updateAvailable;
      if (filter === "failed") return app.checkStatus === "failed";
      if (filter === "muted") return !app.notificationsEnabled;
      if (filter === "fresh") return !isStale(app) && app.checkStatus === "success";
      return true;
    };

    return apps.filter(matches).sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "checked") return (timestamp(b.lastCheckedAt) ?? 0) - (timestamp(a.lastCheckedAt) ?? 0);
      return attentionScore(a) - attentionScore(b) || a.name.localeCompare(b.name);
    });
  }, [apps, filter, query, sortBy]);

  async function check(app: WatchedAppRow) {
    setBusyId(app.id);
    const started = Date.now();
    setCheckingIds((current) => ({ ...current, [app.id]: started }));
    setClock(started);
    mutate((pages) => updateWatchedApp(pages, app.id, { checkStatus: "checking" }), { revalidate: false });
    try {
      const res = await csrfFetch(`/api/apps/${app.id}/check`, { method: "POST" });
      if (!res.ok) throw new Error();
      addToast(`Checking ${app.name}…`, "success");
      void mutate();
    } catch {
      setCheckingIds((current) => { const next = { ...current }; delete next[app.id]; return next; });
      void mutate();
      addToast(`Could not queue a check for ${app.name}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    const onCheckingStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ appId: string; startedAt: number }>).detail;
      if (detail) {
        setCheckingIds((current) => ({ ...current, [detail.appId]: detail.startedAt }));
        setClock(detail.startedAt);
      }
    };
    const onAppsChanged = () => void mutate();
    window.addEventListener("lepatch:checking-started", onCheckingStarted);
    window.addEventListener("lepatch:apps-changed", onAppsChanged);
    return () => {
      window.removeEventListener("lepatch:checking-started", onCheckingStarted);
      window.removeEventListener("lepatch:apps-changed", onAppsChanged);
    };
  }, [mutate]);

  async function markSeen(app: WatchedAppRow) {
    setBusyId(app.id);
    const before = data;
    mutate((pages) => updateWatchedApp(pages, app.id, { updateAvailable: false }), { revalidate: false });
    try {
      const res = await csrfFetch("/api/releases/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedAppId: app.id }),
      });
      if (!res.ok) throw new Error();
      addToast(`${app.name} marked as seen`, "success");
      void mutate();
    } catch {
      if (before) mutate(before, { revalidate: false });
      addToast("Could not mark as seen", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleMute(app: WatchedAppRow) {
    setBusyId(app.id);
    const before = data;
    mutate((pages) => updateWatchedApp(pages, app.id, { notificationsEnabled: !app.notificationsEnabled }), { revalidate: false });
    try {
      const res = await csrfFetch(`/api/apps/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationsEnabled: !app.notificationsEnabled }),
      });
      if (!res.ok) throw new Error();
      addToast(app.notificationsEnabled ? `Muted ${app.name}` : `Unmuted ${app.name}`, "success");
      void mutate();
    } catch {
      if (before) mutate(before, { revalidate: false });
      addToast("Could not update notifications", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(app: WatchedAppRow) {
    setBusyId(app.id);
    const before = data;
    mutate((pages) => removeWatchedApp(pages, app.id), { revalidate: false });
    try {
      const res = await csrfFetch(`/api/apps/${app.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      addToast(`Removed ${app.name}`, "success");
      setPendingDelete(null);
      void mutate();
    } catch {
      if (before) mutate(before, { revalidate: false });
      addToast("Could not remove this repository", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip
        items={[
          { label: "Watched", value: counts.all },
          { label: "Updates", value: counts.updates, tone: counts.updates > 0 ? "warning" : undefined },
          { label: "Failed", value: counts.failed, tone: counts.failed > 0 ? "danger" : undefined },
          { label: "Up to date", value: counts.fresh, tone: counts.fresh > 0 ? "success" : undefined },
        ]}
      />
      <div className="live-strip" aria-live="polite">
        <span className={cn("live-dot", isValidating && "live-dot--syncing")} />
        <span>{isValidating ? "Syncing changes" : "Updated just now"}</span>
      </div>

      <Toolbar className="justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, repo or tag"
              aria-label="Filter watched repositories"
              className="pl-8 pr-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="icon-button absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="chip-row" role="group" aria-label="Filter repositories">
            {(
              [
                ["all", "All"],
                ["attention", "Needs attention"],
                ["updates", "Updates"],
                ["failed", "Failed"],
                ["muted", "Muted"],
                ["fresh", "Up to date"],
              ] as Array<[FilterKey, string]>
            ).map(([key, label]) => (
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

        <div className="flex items-center gap-2">
          <Select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
            aria-label="Sort repositories"
            className="w-36"
          >
            <option value="attention">Needs attention</option>
            <option value="name">Name</option>
            <option value="checked">Recently checked</option>
          </Select>
          {canAdd && (
            <div className="app-primary-action">
              <AddAppButton watchedApps={watchedApps} canAdd={canAdd} />
            </div>
          )}
        </div>
      </Toolbar>

      {error ? (
        <ErrorState
          title="Could not load repositories"
          description="The list may be stale. Reload the page to try again."
        />
      ) : isLoading && apps.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <SkeletonRows rows={5} columns={3} />
        </div>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-4 w-4" />}
          title="No repositories watched yet"
          description="Add a repository and LePatch will check it on a schedule, classify each release, and notify you when something ships."
          action={
            <Link href="/apps/search" className="btn btn--primary btn--sm">
              Find repositories
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nothing matches this view"
          description="Try a different filter or clear the search."
          action={
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <p className="text-xs text-text-faint">
            {visible.length} of {apps.length} shown
          </p>
          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            <List>
              {visible.map((app) => {
                const state = status(app);
                  const busy = busyId === app.id;
                  const started = checkingIds[app.id];
                  const lastChecked = timestamp(app.lastCheckedAt) ?? 0;
                  const checking = started !== undefined && lastChecked <= started && clock - started < 5 * 60 * 1000;
                return (
                  <ListRow
                    key={app.id}
                    className="app-list-row"
                    leading={<RowAvatar tone={state.tone}>{app.name.slice(0, 1).toUpperCase()}</RowAvatar>}
                    title={
                      <>
                        <Link href={`/apps/${app.id}`} className="truncate text-sm font-semibold text-text hover:text-accent">{app.name}</Link>
                        <StatusDot tone={checking ? "warning" : state.tone}>{checking ? "Checking now" : state.label}</StatusDot>
                      </>
                    }
                    subtitle={app.repoFullName}
                    meta={
                      <>
                        <span className="mono">{app.latestSeenTag ?? "no release yet"}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {app.lastCheckedAt ? <>checked <RelativeTime value={app.lastCheckedAt} /></> : "never checked"}
                        </span>
                        {app.includePrereleases && <span>pre-releases on</span>}
                      </>
                    }
                    trailing={
                      <div className="flex items-center gap-0.5" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
                        <button
                          type="button"
                          onClick={() => markSeen(app)}
                          disabled={busy}
                          className="icon-button disabled:opacity-50"
                          title="Mark the latest release as seen"
                          aria-label={`Mark ${app.name} as seen`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMute(app)}
                          disabled={busy}
                          className={cn("icon-button disabled:opacity-50", !app.notificationsEnabled && "text-text-faint")}
                          title={app.notificationsEnabled ? "Mute notifications" : "Unmute notifications"}
                          aria-label={app.notificationsEnabled ? `Mute ${app.name}` : `Unmute ${app.name}`}
                        >
                          <BellOff className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => check(app)}
                          disabled={busy}
                          className="icon-button disabled:opacity-50"
                          title="Check for releases now"
                          aria-label={`Check ${app.name} now`}
                        >
                          <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(app)}
                          disabled={busy}
                          className="icon-button text-text-faint hover:text-status-danger disabled:opacity-50"
                          title="Stop watching"
                          aria-label={`Stop watching ${app.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <ChevronRight className="ml-1 h-4 w-4 text-text-faint" aria-hidden="true" />
                      </div>
                    }
                  />
                );
              })}
            </List>
          </div>
          {hasMore && (
            <div className="flex justify-center pt-3">
              <button type="button" className="btn btn--secondary btn--lg" disabled={isLoading} onClick={() => void setSize(size + 1)}>
                {isLoading ? "Loading repositories…" : `Load more · ${apps.length} of ${total.toLocaleString()}`}
              </button>
            </div>
          )}
        </>
      )}

      {counts.failed > 0 && (
        <p className="flex items-center gap-2 text-xs text-text-muted">
          <AlertTriangle className="h-3.5 w-3.5 text-status-danger" aria-hidden="true" />
          {counts.failed} repositor{counts.failed === 1 ? "y is" : "ies are"} failing checks. Open one to see the error
          and reconnect GitHub if the token expired.
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Stop watching this repository?"
        message={
          pendingDelete
            ? `${pendingDelete.name} and its stored release history will be removed. You can add it again later.`
            : ""
        }
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void remove(pendingDelete);
        }}
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Check, Filter, Loader2, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppsTable } from "@/components/AppsTable";
import { AddAppModal } from "@/components/AddAppModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useApps } from "@/lib/use-swr";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

type App = {
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

type FilterKey = "all" | "updates" | "failed" | "quiet" | "notificationsOff" | "stale";
type SortKey = "status" | "name" | "checked" | "version";

const STALE_MS = 24 * 60 * 60 * 1000;

function appNeedsUpdate(app: App): boolean {
  return app.updateAvailable;
}

function getTimestamp(value: string | null): number | null {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function isStale(app: App): boolean {
  const ts = getTimestamp(app.lastCheckedAt);
  if (ts === null) return true;
  return Date.now() - ts > STALE_MS;
}

function statusPriority(app: App): number {
  if (app.checkStatus === "failed") return 0;
  if (app.updateAvailable) return 2;
  if (!app.notificationsEnabled) return 3;
  if (isStale(app)) return 4;
  return 5;
}

async function runBulkRequest(appIds: string[], action: (appId: string) => Promise<void>) {
  for (const appId of appIds) {
    await action(appId);
  }
}

export function AppsClient({ initialApps, watchedApps = [], canAdd = true }: { initialApps: App[]; initialTotal: number; watchedApps?: { id: string; repoFullName: string }[]; canAdd?: boolean }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("status");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [addAppModalOpen, setAddAppModalOpen] = useState(false);
  const { data } = useApps();
  const apps = data?.apps || initialApps;

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matchesQuery = (app: App) => {
      if (!q) return true;
      return (
        app.name.toLowerCase().includes(q) ||
        app.repoFullName.toLowerCase().includes(q) ||
        (app.latestSeenTag || "").toLowerCase().includes(q) ||
        app.checkStatus.toLowerCase().includes(q)
      );
    };
    const matchesFilter = (app: App) => {
      if (filter === "all") return true;
      if (filter === "updates") return appNeedsUpdate(app);
      if (filter === "failed") return app.checkStatus === "failed";
      if (filter === "quiet")
        return !app.updateAvailable && app.checkStatus === "success" && app.notificationsEnabled && !isStale(app);
      if (filter === "notificationsOff") return !app.notificationsEnabled;
      if (filter === "stale") return isStale(app);
      return true;
    };

    return [...apps]
      .filter(matchesQuery)
      .filter(matchesFilter)
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "checked")
          return (getTimestamp(b.lastCheckedAt) || 0) - (getTimestamp(a.lastCheckedAt) || 0);
        if (sortBy === "version") return (b.latestSeenTag || "").localeCompare(a.latestSeenTag || "");
        return statusPriority(a) - statusPriority(b) || a.name.localeCompare(b.name);
      });
  }, [apps, filter, query, sortBy]);

  const counts = useMemo(() => {
    return apps.reduce(
      (acc, app) => {
        acc.total += 1;
        if (appNeedsUpdate(app)) acc.updates += 1;
        if (app.checkStatus === "failed") acc.failed += 1;
        if (!app.notificationsEnabled) acc.notificationsOff += 1;
        if (isStale(app)) acc.stale += 1;
        if (!appNeedsUpdate(app) && app.checkStatus === "success" && app.notificationsEnabled && !isStale(app))
          acc.quiet += 1;
        return acc;
      },
      { total: 0, updates: 0, failed: 0, notificationsOff: 0, stale: 0, quiet: 0 }
    );
  }, [apps]);

  const selectedCount = selectedIds.length;
  const visibleIds = filteredApps.map((app) => app.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.includes(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const topAttention = useMemo(() => {
    return [...apps]
      .sort((a, b) => statusPriority(a) - statusPriority(b) || a.name.localeCompare(b.name))
      .filter((app) => appNeedsUpdate(app) || app.checkStatus === "failed" || !app.notificationsEnabled || isStale(app))
      .slice(0, 6);
  }, [apps]);

  const filterButtons: Array<{ key: FilterKey; label: string; count: number; tone?: "warning" | "error" | "muted" }> = [
    { key: "all", label: "All", count: counts.total },
    { key: "updates", label: "Updates", count: counts.updates, tone: "warning" },
    { key: "failed", label: "Failed", count: counts.failed, tone: "error" },
    { key: "quiet", label: "Quiet", count: counts.quiet, tone: "muted" },
    { key: "notificationsOff", label: "Muted", count: counts.notificationsOff, tone: "muted" },
    { key: "stale", label: "Stale", count: counts.stale, tone: "muted" },
  ];

  function toggleOne(appId: string) {
    setSelectedIds((prev) => (prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId]));
  }
  function toggleAll(ids: string[]) {
    setSelectedIds((prev) => {
      const everySelected = ids.length > 0 && ids.every((id) => prev.includes(id));
      if (everySelected) return prev.filter((id) => !ids.includes(id));
      return Array.from(new Set([...prev, ...ids]));
    });
  }

  function selectWithUpdates() {
    const ids = filteredApps.filter((app) => app.updateAvailable).map((app) => app.id);
    setSelectedIds(ids);
  }
  function selectHealthy() {
    const ids = filteredApps.filter((app) => app.checkStatus === "success" && !app.updateAvailable).map((app) => app.id);
    setSelectedIds(ids);
  }

  async function bulkCheck() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await runBulkRequest(selectedIds, async (appId) => {
        const res = await csrfFetch(`/api/apps/${appId}/check`, { method: "POST" });
        if (!res.ok) throw new Error("Check failed");
      });
      addToast(`Triggered checks for ${selectedIds.length} app${selectedIds.length === 1 ? "" : "s"}`, "success");
      setSelectedIds([]);
      router.refresh();
    } catch {
      addToast("Failed to trigger one or more checks", "error");
    } finally {
      setBusy(false);
    }
  }
  async function bulkMarkSeen() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await runBulkRequest(selectedIds, async (appId) => {
        const res = await csrfFetch("/api/releases/seen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watchedAppId: appId }),
        });
        if (!res.ok) throw new Error("Mark seen failed");
      });
      addToast(`Marked ${selectedIds.length} app${selectedIds.length === 1 ? "" : "s"} as seen`, "success");
      setSelectedIds([]);
      router.refresh();
    } catch {
      addToast("Failed to mark one or more apps seen", "error");
    } finally {
      setBusy(false);
    }
  }
  async function bulkSetNotifications(enabled: boolean) {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await runBulkRequest(selectedIds, async (appId) => {
        const res = await csrfFetch(`/api/apps/${appId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationsEnabled: enabled }),
        });
        if (!res.ok) throw new Error("Update failed");
      });
      addToast(`${enabled ? "Enabled" : "Disabled"} notifications for ${selectedIds.length} app${selectedIds.length === 1 ? "" : "s"}`, "success");
      setSelectedIds([]);
      router.refresh();
    } catch {
      addToast("Failed to update notification settings", "error");
    } finally {
      setBusy(false);
    }
  }
  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      await runBulkRequest(selectedIds, async (appId) => {
        const res = await csrfFetch(`/api/apps/${appId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Delete failed");
      });
      addToast(`Removed ${selectedIds.length} app${selectedIds.length === 1 ? "" : "s"}`, "success");
      setSelectedIds([]);
      setDeleteConfirmOpen(false);
      router.refresh();
    } catch {
      addToast("Failed to remove one or more apps", "error");
    } finally {
      setBusy(false);
    }
  }
  async function checkOne(appId: string) {
    setBusy(true);
    try {
      const res = await csrfFetch(`/api/apps/${appId}/check`, { method: "POST" });
      if (!res.ok) throw new Error("Check failed");
      addToast("Check triggered", "success");
      router.refresh();
    } catch {
      addToast("Failed to trigger check", "error");
    } finally {
      setBusy(false);
    }
  }
  async function markSeenOne(appId: string) {
    setBusy(true);
    try {
      const res = await csrfFetch("/api/releases/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedAppId: appId }),
      });
      if (!res.ok) throw new Error("Mark seen failed");
      addToast("Marked as seen", "success");
      router.refresh();
    } catch {
      addToast("Failed to mark as seen", "error");
    } finally {
      setBusy(false);
    }
  }
  const activeFilter = filterButtons.find((b) => b.key === filter);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4 min-w-0">
        <div className="app-shell-card p-3.5 sm:p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps, repos, versions…"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] py-2.5 pl-10 pr-9 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-faint)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] hover:text-[var(--color-text)]"
                  aria-label="Clear filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                className="btn btn--ghost btn--sm lg:hidden"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {filter !== "all" && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-[0.62rem] font-semibold text-[var(--color-accent-foreground)]">
                    1
                  </span>
                )}
              </button>

              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_40%,transparent)] px-2.5 py-2 text-xs text-[var(--color-text-muted)]">
                <ArrowUpDown className="h-3.5 w-3.5 text-[var(--color-text-faint)]" />
                <span className="hidden sm:inline">Sort</span>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as SortKey)}
                  className="bg-transparent text-sm text-[var(--color-text)] focus:outline-none"
                >
                  <option value="status">Status</option>
                  <option value="name">Name</option>
                  <option value="checked">Last checked</option>
                  <option value="version">Latest tag</option>
                </select>
              </label>
            </div>
          </div>

          <div className="chip-row mt-3 hidden lg:flex">
            {filterButtons.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                data-active={filter === item.key}
                className="chip"
              >
                <Filter className="h-3 w-3" />
                {item.label}
                <span className="text-[0.7rem] opacity-70">{item.count}</span>
              </button>
            ))}
          </div>

          {showFilters && (
            <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
              {filterButtons.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setFilter(item.key);
                    setShowFilters(false);
                  }}
                  data-active={filter === item.key}
                  className="chip justify-between w-full"
                >
                  <span className="flex items-center gap-1.5">
                    {item.label}
                  </span>
                  <span className="text-[0.7rem] opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--color-text-faint)]">
            <span>
              Showing <span className="text-[var(--color-text)] font-medium">{filteredApps.length}</span> of{" "}
              <span className="text-[var(--color-text)] font-medium">{counts.total}</span>
            </span>
            {activeFilter && activeFilter.key !== "all" && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-1.5 py-0.5 hover:border-[var(--color-text-faint)]"
                >
                  {activeFilter.label} <X className="h-3 w-3" />
                </button>
              </>
            )}
            {selectedCount > 0 && (
              <>
                <span>·</span>
                <span className="text-[var(--color-accent)]">{selectedCount} selected</span>
              </>
            )}
          </div>
        </div>

        {selectedCount > 0 && (
          <div className="sticky-action-bar">
            <span className="text-[0.82rem] text-[var(--color-text)] mr-1">
              <span className="font-semibold">{selectedCount}</span> selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" disabled={busy} onClick={bulkCheck} className="btn btn--ghost btn--sm">
                {busy ? <Loader2 className="h-3.5 w-3.5 spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Check
              </button>
              <button type="button" disabled={busy} onClick={bulkMarkSeen} className="btn btn--ghost btn--sm">
                <Check className="h-3.5 w-3.5" />
                Mark seen
              </button>
              <button type="button" disabled={busy} onClick={() => bulkSetNotifications(true)} className="btn btn--ghost btn--sm">
                <span>Alerts on</span>
              </button>
              <button type="button" disabled={busy} onClick={() => bulkSetNotifications(false)} className="btn btn--ghost btn--sm">
                <span>Alerts off</span>
              </button>
              <button type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(true)} className="btn btn--danger btn--sm">
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Remove</span>
              </button>
              <button type="button" onClick={() => setSelectedIds([])} className="btn btn--subtle btn--sm">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {topAttention.length > 0 && (
          <div className="mb-3 xl:hidden rounded-xl border border-[var(--theme-status-pending-border)] bg-[var(--theme-status-pending-bg)] px-4 py-3">
            <p className="text-xs font-semibold text-[var(--color-status-warning)]">
              {topAttention.length} app{topAttention.length === 1 ? "" : "s"} need{topAttention.length === 1 ? "s" : ""} attention
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {topAttention.slice(0, 4).map((app) => (
                <a
                  key={app.id}
                  href={`/apps/${app.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--theme-status-pending-border)] bg-[color-mix(in_srgb,var(--color-status-warning)_8%,transparent)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--color-status-warning)] hover:bg-[color-mix(in_srgb,var(--color-status-warning)_15%,transparent)] transition-colors"
                >
                  {app.name}
                </a>
              ))}
              {topAttention.length > 4 && (
                <span className="inline-flex items-center px-2 py-0.5 text-[0.7rem] text-[var(--color-status-warning)]">
                  +{topAttention.length - 4} more
                </span>
              )}
            </div>
          </div>
        )}

        <AppsTable
          apps={filteredApps}
          selectedIds={selectedIds}
          onToggleApp={toggleOne}
          onToggleAll={toggleAll}
          onSelectWithUpdates={selectWithUpdates}
          onSelectHealthy={selectHealthy}
          allSelected={allVisibleSelected}
          someSelected={someVisibleSelected}
          onCheck={checkOne}
          onMarkSeen={markSeenOne}
        />
      </div>

      <aside className="space-y-4 desktop-only">
        <div className="app-shell-card p-4">
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Needs attention
          </h3>
          <div className="mt-3 space-y-2">
            {topAttention.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">Nothing needs attention right now.</p>
            ) : (
              topAttention.map((app) => {
                const stale = isStale(app);
                return (
                  <a
                    key={app.id}
                    href={`/apps/${app.id}`}
                    className="block rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] p-3 transition-all hover:border-[color-mix(in_srgb,var(--color-border)_140%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-surface-elevated)_80%,transparent)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--color-text)]">{app.name}</div>
                        <div className="mt-0.5 truncate text-[0.72rem] text-[var(--color-text-faint)] app-mono">
                          {app.repoFullName}
                        </div>
                      </div>
                      <span className="text-[0.7rem] text-[var(--color-text-faint)]">
                        {app.checkStatus === "failed"
                          ? "Failed"
                          : app.updateAvailable
                          ? "Update"
                          : !app.notificationsEnabled
                          ? "Muted"
                          : stale
                          ? "Stale"
                          : "Ok"}
                      </span>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>

        <div className="app-shell-card p-4">
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Quick links
          </h3>
          <div className="mt-3 space-y-1.5">
            <button
              onClick={() => setAddAppModalOpen(true)}
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)] transition-colors w-full text-left"
            >
              <span>Add app</span>
              <span className="text-[var(--color-text-faint)]">→</span>
            </button>
            <a
              href="/apps/search"
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)] transition-colors"
            >
              <span>Find repositories</span>
              <span className="text-[var(--color-text-faint)]">→</span>
            </a>
            <a
              href="/admin/settings"
              className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent-border)] hover:text-[var(--color-accent)] transition-colors"
            >
              <span>Audit log</span>
              <span className="text-[var(--color-text-faint)]">→</span>
            </a>
          </div>
        </div>

        <div className="app-shell-card p-4">
          <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Health snapshot
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Total" value={counts.total} />
            <Stat label="Healthy" value={counts.total - counts.failed} tone="success" />
            <Stat label="Updates" value={counts.updates} tone={counts.updates > 0 ? "warning" : "muted"} />
            <Stat label="Failed" value={counts.failed} tone={counts.failed > 0 ? "error" : "muted"} />
            <Stat label="Muted" value={counts.notificationsOff} tone="muted" />
            <Stat label="Stale" value={counts.stale} tone={counts.stale > 0 ? "stale" : "muted"} />
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Remove selected apps"
        message={`This will permanently delete ${selectedCount} app${selectedCount === 1 ? "" : "s"} and their releases.`}
        confirmLabel="Remove"
        variant="danger"
        confirmText="REMOVE"
        onConfirm={bulkDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <AddAppModal
        open={addAppModalOpen}
        onClose={() => setAddAppModalOpen(false)}
        watchedApps={watchedApps}
        canAdd={canAdd}
      />
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warning" | "error" | "stale" | "muted" }) {
  const colors = {
    default: "var(--color-text)",
    success: "var(--color-status-success)",
    warning: "var(--color-status-warning)",
    error: "var(--color-status-danger)",
    stale: "var(--color-status-warning)",
    muted: "var(--color-text-muted)",
  }[tone];
  return (
    <div className="app-stat !p-2.5">
      <div className="app-stat-label">{label}</div>
      <div className="app-stat-value !text-lg !font-bold" style={{ color: colors }}>
        {value}
      </div>
    </div>
  );
}

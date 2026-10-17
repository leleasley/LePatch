"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { GitCommit, Loader2, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { CommitRow } from "@/components/CommitRow";
import { EmptyState } from "@/components/ui/Card";
import { List, StatusDot } from "@/components/ui/List";
import type { CommitSnapshot, CommitWithStatus } from "@/lib/commit-snapshot";

const REFRESH_WHEN_VISIBLE_MS = 5 * 60_000;
const REFRESH_WHEN_HIDDEN_MS = 15 * 60_000;

const STATUS_ORDER: Record<string, number> = {
  failure: 0,
  in_progress: 1,
  pending: 2,
  success: 3,
  neutral: 4,
};

function sortByStatus(commits: CommitWithStatus[]): CommitWithStatus[] {
  return [...commits].sort(
    (a, b) => (STATUS_ORDER[a.status.state] ?? 4) - (STATUS_ORDER[b.status.state] ?? 4)
  );
}

export function CommitsTab({
  endpoint,
  defaultBranch,
}: {
  endpoint: string;
  defaultBranch?: string;
}) {
  const [allCommits, setAllCommits] = useState<CommitWithStatus[]>([]);
  const [data, setData] = useState<CommitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const isVisibleRef = useRef(true);
  const backoffUntilRef = useRef<number>(0);

  const fetchPage = useCallback(
    async (p: number, refresh = false) => {
      startTransition(() => {
        if (refresh) setRefreshing(true);
        else if (p === 1 && allCommits.length === 0) setLoading(true);
        if (p === 1) setError(null);
      });
      try {
        const url = new URL(endpoint, typeof window !== "undefined" ? window.location.origin : "http://x");
        url.searchParams.set("page", String(p));
        if (refresh) url.searchParams.set("refresh", "1");
        const res = await fetch(url.pathname + url.search, { cache: "no-store" });
        if (res.status === 429) {
          backoffUntilRef.current = Date.now() + 5 * 60_000;
          if (allCommits.length > 0) return;
          startTransition(() => setError("Too many requests. Try refreshing in a minute."));
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed (${res.status})`);
        }
        const snapshot: CommitSnapshot = await res.json();
        startTransition(() => {
          setData(snapshot);
          setLastRefreshed(new Date());

          if (p === 1) {
            setAllCommits(sortByStatus(snapshot.commits));
          } else {
            setAllCommits((prev) => sortByStatus([...prev, ...snapshot.commits]));
          }
          setPage(p);
          if (p > 1) setError(null);
        });
      } catch (err) {
        if (allCommits.length === 0) {
          startTransition(() => setError(err instanceof Error ? err.message : "Failed to load commits"));
        }
      } finally {
        startTransition(() => {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        });
      }
    },
    [endpoint, allCommits.length]
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  // Visibility-aware refresh
  useEffect(() => {
    if (typeof document === "undefined") return;
    isVisibleRef.current = document.visibilityState === "visible";

    function handleVisibility() {
      isVisibleRef.current = document.visibilityState === "visible";
    }
    document.addEventListener("visibilitychange", handleVisibility);

    let timeoutId: ReturnType<typeof setTimeout>;
    function schedule() {
      const interval = isVisibleRef.current ? REFRESH_WHEN_VISIBLE_MS : REFRESH_WHEN_HIDDEN_MS;
      timeoutId = setTimeout(async () => {
        // Served from the 10-minute server cache — cheap and instant. Only the
        // manual Refresh button passes refresh=1 to hit GitHub directly.
        if (isVisibleRef.current && Date.now() > backoffUntilRef.current) {
          await fetchPage(1, false);
        }
        schedule();
      }, interval);
    }
    schedule();

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchPage]);

  const counts = allCommits.length > 0
    ? allCommits.reduce(
        (acc, c) => {
          if (c.status.state === "success") acc.success += 1;
          else if (c.status.state === "failure") acc.failure += 1;
          else if (c.status.state === "in_progress" || c.status.state === "pending") acc.pending += 1;
          acc.total += 1;
          return acc;
        },
        { success: 0, failure: 0, pending: 0, total: 0 }
      )
    : null;

  const hasMore = data?.hasMore ?? false;

  function retry() {
    setAllCommits([]);
    setPage(1);
    fetchPage(1, true);
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted">
          {counts && (
            <>
              {counts.failure > 0 && <StatusDot tone="danger">{counts.failure} failing</StatusDot>}
              {counts.pending > 0 && <StatusDot tone="warning">{counts.pending} running</StatusDot>}
              {counts.success > 0 && <StatusDot tone="success">{counts.success} passing</StatusDot>}
              {counts.failure === 0 && counts.pending === 0 && counts.success === 0 && counts.total > 0 && (
                <StatusDot tone="neutral">No CI on these commits</StatusDot>
              )}
              {defaultBranch && (
                <span className="text-text-faint">
                  on <span className="mono">{defaultBranch}</span>
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span
              className="hidden items-center gap-1 text-xs text-text-faint sm:inline-flex"
              title={lastRefreshed.toLocaleString()}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={retry}
            disabled={refreshing}
            className="btn btn--ghost btn--sm"
            title="Refresh commits"
            aria-label="Refresh commits"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && !allCommits.length && (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-border bg-status-danger/10 px-4 py-3 text-sm text-status-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Could not load commits</p>
            <p className="mt-0.5 text-xs opacity-80">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div role="status" aria-busy="true" className="flex flex-col divide-y divide-divider">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="skeleton h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2 py-1">
                <div className="skeleton h-3.5 w-3/4" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : allCommits.length > 0 ? (
        <>
          <List>
            {allCommits.map((commit: CommitWithStatus, idx) => (
              <CommitRow key={commit.sha} commit={commit} expanded={idx === 0 && commit.status.checks.length > 1} />
            ))}
          </List>

          {hasMore && (
            <div className="flex justify-center border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setLoadingMore(true);
                  fetchPage(page + 1);
                }}
                disabled={loadingMore}
                className="btn btn--ghost btn--sm"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                Load older commits
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-3 text-xs text-text-faint">
            <StatusDot tone="success">Passing</StatusDot>
            <StatusDot tone="danger">Failing</StatusDot>
            <StatusDot tone="warning">Running</StatusDot>
            <StatusDot tone="neutral">No CI</StatusDot>
            <span className="ml-auto">
              {allCommits.length} commit{allCommits.length === 1 ? "" : "s"} · cached 10 min · auto-refresh when tab is open
            </span>
          </div>
        </>
      ) : (
        <div className="p-4">
          <EmptyState
            icon={<GitCommit className="h-4 w-4" />}
            title="No commits yet"
            description="This repository does not have any commits, or we could not reach GitHub. Try refreshing."
            action={
              <button type="button" onClick={retry} className="btn btn--ghost btn--sm" disabled={refreshing}>
                {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                Refresh
              </button>
            }
          />
        </div>
      )}
    </div>
  );
}

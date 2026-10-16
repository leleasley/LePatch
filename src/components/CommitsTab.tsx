"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { GitCommit, Loader2, RefreshCw, AlertTriangle, XCircle, CheckCircle2, Clock } from "lucide-react";
import { CommitRow } from "@/components/CommitRow";
import { StatusBadge } from "@/components/StatusBadge";
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {counts && (
            <>
              {counts.failure > 0 && <StatusBadge status="failure" size="sm" label={`${counts.failure} failing`} />}
              {counts.pending > 0 && <StatusBadge status="in_progress" size="sm" label={`${counts.pending} running`} />}
              {counts.success > 0 && <StatusBadge status="success" size="sm" label={`${counts.success} passing`} />}
              {counts.failure === 0 && counts.pending === 0 && counts.success === 0 && counts.total > 0 && (
                <StatusBadge status="neutral" size="sm" label="No CI on these commits" />
              )}
              {defaultBranch && (
                <span className="text-[0.72rem] text-[var(--theme-text-faint)] ml-1">
                  on <span className="app-mono">{defaultBranch}</span>
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRefreshed && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[0.7rem] text-[var(--theme-text-faint)]"
              title={lastRefreshed.toLocaleString()}
            >
              <Clock className="h-3 w-3" />
              {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setAllCommits([]);
              fetchPage(1, true);
            }}
            disabled={refreshing}
            className="btn btn--ghost btn--sm"
            title="Refresh commits"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && !allCommits.length && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--theme-status-failure-border)] bg-[var(--theme-status-failure-bg)] p-3 text-sm text-[var(--theme-status-failure)]">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Couldn't load commits</p>
            <p className="text-[0.78rem] opacity-80 mt-0.5">{error}</p>
            <button
              type="button"
              onClick={() => {
                setAllCommits([]);
                setPage(1);
                fetchPage(1, true);
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-[0.78rem] font-medium underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="app-shell-card p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="commit-row">
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
          <div className="app-shell-card p-2">
            {allCommits.map((commit: CommitWithStatus, idx) => (
              <CommitRow key={commit.sha} commit={commit} expanded={idx === 0 && commit.status.checks.length > 1} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setLoadingMore(true);
                  fetchPage(page + 1);
                }}
                disabled={loadingMore}
                className="btn btn--ghost btn--sm"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 spin" />}
                Load older commits
              </button>
            </div>
          )}

          <p className="text-center text-[0.7rem] text-[var(--theme-text-faint)] pt-1">
            {allCommits.length} commit{allCommits.length === 1 ? "" : "s"} · cached 10 min · auto-refresh when tab is open
          </p>
        </>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon">
            <GitCommit className="h-5 w-5" />
          </span>
          <p className="empty-state-title">No commits yet</p>
          <p className="empty-state-copy">
            This repository doesn't have any commits, or we couldn't reach GitHub. Try refreshing.
          </p>
          <button
            type="button"
            onClick={() => {
              setAllCommits([]);
              setPage(1);
              fetchPage(1, true);
            }}
            className="btn btn--ghost btn--sm mt-3"
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>
      )}

      {allCommits.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[0.7rem] text-[var(--theme-text-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-[var(--theme-status-success)]" /> Passing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <XCircle className="h-3 w-3 text-[var(--theme-status-failure)]" /> Failing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 text-[var(--theme-status-pending)]" /> Running
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="status-pill status-pill--neutral" style={{ padding: "0.15rem 0.4rem", fontSize: "0.65rem" }}>
              —
            </span>{" "}
            No CI
          </span>
        </div>
      )}
    </div>
  );
}

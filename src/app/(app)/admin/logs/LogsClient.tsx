"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Activity,
  AlertTriangle,
  XCircle,
  Bell,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkeletonRows } from "@/components/ui/Card";
import { MetricStrip, Panel, StatusDot } from "@/components/ui/List";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

type QueueData = {
  name: string;
  counts?: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  recentJobs?: {
    waiting: Array<{ id: string | undefined; name: string; data: unknown; timestamp: number; attemptsMade: number }>;
    active: Array<{ id: string | undefined; name: string; data: unknown; timestamp: number; attemptsMade: number }>;
    failed: Array<{ id: string | undefined; name: string; data: unknown; timestamp: number; attemptsMade: number; failedReason?: string }>;
    completedCount: number;
  };
  isPaused?: boolean;
  error?: string;
};

function queueIcon(name: string) {
  if (name.includes("release")) return Bell;
  if (name.includes("notification")) return Bell;
  if (name.includes("tool")) return Wrench;
  return Activity;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

export function LogsClient() {
  const [queues, setQueues] = useState<QueueData[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const fetchQueues = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/queues");
      if (!res.ok) throw new Error("Failed to fetch queues");
      const data = await res.json();
      setQueues(data.queues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queues");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAllFailed = useCallback(async () => {
    setClearing(true);
    try {
      const res = await csrfFetch("/api/admin/queues/clear-failed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to clear failed jobs");
      const data = await res.json();
      setError(null);
      addToast(`Cleared ${data.totalCleared} failed job${data.totalCleared === 1 ? "" : "s"} across all queues`, "success");
      await fetchQueues();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear failed jobs";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setClearing(false);
    }
  }, [fetchQueues, addToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueues();
    const interval = setInterval(fetchQueues, 30000);
    return () => clearInterval(interval);
  }, [fetchQueues]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Logs & queues"
        description="Background worker queues for release checks, notifications and backups. Refreshes every 30 seconds."
        actions={
          <>
            <button type="button" onClick={clearAllFailed} disabled={clearing} className="btn btn--danger btn--sm">
              {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
              Clear failed
            </button>
            <button type="button" onClick={fetchQueues} className="btn btn--ghost btn--sm">
              <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
              Refresh
            </button>
          </>
        }
      />

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border border-status-danger/40 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {loading && queues.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <SkeletonRows rows={3} columns={4} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {queues.map((queue) => {
            if (queue.error) {
              const Icon = XCircle;
              return (
                <Panel
                  key={queue.name}
                  title={
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-status-danger" aria-hidden="true" />
                      {queue.name}
                    </span>
                  }
                  actions={<StatusDot tone="danger">Unavailable</StatusDot>}
                >
                  <p role="alert" className="text-sm text-status-danger">{queue.error}</p>
                </Panel>
              );
            }

            const Icon = queueIcon(queue.name);
            const total = (queue.counts?.waiting || 0) + (queue.counts?.active || 0);

            return (
              <Panel
                key={queue.name}
                title={
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-text-faint" aria-hidden="true" />
                    {queue.name}
                  </span>
                }
                description={`${total} job${total === 1 ? "" : "s"} pending`}
                actions={
                  <StatusDot tone={queue.isPaused ? "warning" : "success"}>
                    {queue.isPaused ? "Paused" : "Running"}
                  </StatusDot>
                }
              >
                <MetricStrip
                  items={[
                    { label: "Waiting", value: queue.counts?.waiting ?? 0 },
                    { label: "Active", value: queue.counts?.active ?? 0, tone: "warning" },
                    { label: "Delayed", value: queue.counts?.delayed ?? 0, tone: "warning" },
                    { label: "Completed", value: queue.counts?.completed ?? 0, tone: "success" },
                    { label: "Failed", value: queue.counts?.failed ?? 0, tone: (queue.counts?.failed ?? 0) > 0 ? "danger" : undefined },
                    { label: "Paused", value: queue.counts?.paused ?? 0 },
                  ]}
                />

                {queue.recentJobs && queue.recentJobs.failed.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-status-danger">
                      Recent failed jobs ({queue.recentJobs.failed.length})
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {queue.recentJobs.failed.map((job) => (
                        <div key={job.id} className="rounded-md border border-border bg-surface p-3 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-text">{job.name}</span>
                            <span className="text-text-faint">{formatTime(job.timestamp)}</span>
                          </div>
                          {job.failedReason && (
                            <pre className="mono mt-1 overflow-x-auto text-status-danger">{job.failedReason}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Panel>
            );
          })}
        </div>
      )}

    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
  Activity,
  Clock,
  CheckCircle,
  PauseCircle,
  AlertTriangle,
  XCircle,
  Bell,
  Wrench,
} from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
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

function queueColor(name: string) {
  if (name.includes("release") || name.includes("tool")) return "border-l-cyan-500";
  if (name.includes("notification")) return "border-l-emerald-500";
  return "border-l-slate-500";
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

function StatBox({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-lg ${bg} p-3`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function QueuesTab() {
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
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-400">
          BullMQ queue status — auto-refreshes every 30s
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={clearAllFailed}
            disabled={clearing}
            className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear Failed
          </button>
          <button
            onClick={fetchQueues}
            className="flex items-center gap-2 rounded-lg border border-line/50 bg-panel/80 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && queues.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading queues...
        </div>
      ) : (
        <div className="space-y-4">
          {queues.map((queue) => {
            if (queue.error) {
              return (
                <div key={queue.name} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-red-400" />
                    <span className="font-medium text-white">{queue.name}</span>
                    <span className="text-sm text-red-300">{queue.error}</span>
                  </div>
                </div>
              );
            }

            const Icon = queueIcon(queue.name);
            const total = (queue.counts?.waiting || 0) + (queue.counts?.active || 0);

            return (
              <div
                key={queue.name}
                className={`rounded-xl border border-line/50 bg-panel/80 border-l-4 ${queueColor(queue.name)} p-5`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white/5 p-2">
                      <Icon className="h-5 w-5 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{queue.name}</h3>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        {queue.isPaused && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <PauseCircle className="h-3 w-3" /> Paused
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {total} pending
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                  <StatBox label="Waiting" value={queue.counts?.waiting ?? 0} icon={Clock} color="text-blue-400" bg="bg-blue-500/10" />
                  <StatBox label="Active" value={queue.counts?.active ?? 0} icon={Activity} color="text-amber-400" bg="bg-amber-500/10" />
                  <StatBox label="Delayed" value={queue.counts?.delayed ?? 0} icon={Clock} color="text-yellow-400" bg="bg-yellow-500/10" />
                  <StatBox label="Completed" value={queue.counts?.completed ?? 0} icon={CheckCircle} color="text-emerald-400" bg="bg-emerald-500/10" />
                  <StatBox label="Failed" value={queue.counts?.failed ?? 0} icon={XCircle} color="text-red-400" bg="bg-red-500/10" />
                  <StatBox label="Paused" value={queue.counts?.paused ?? 0} icon={PauseCircle} color="text-slate-400" bg="bg-slate-500/10" />
                </div>

                {queue.recentJobs && queue.recentJobs.failed.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-red-400 hover:text-red-300">
                      Recent Failed Jobs ({queue.recentJobs.failed.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {queue.recentJobs.failed.map((job) => (
                        <div key={job.id} className="rounded-lg bg-red-500/5 p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-300">{job.name}</span>
                            <span className="text-slate-500">{formatTime(job.timestamp)}</span>
                          </div>
                          {job.failedReason && (
                            <pre className="mt-1 overflow-x-auto text-red-300/80">{job.failedReason}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LogsClient() {
  return (
    <div>
      <HeroCard
        icon={<Terminal className="h-5 w-5" />}
        title="Logs & Queues"
        subtitle="Background worker queues for release checks and notifications."
      />
      <div className="mt-6">
        <QueuesTab />
      </div>
    </div>
  );
}

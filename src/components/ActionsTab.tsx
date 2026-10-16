"use client";

import { useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { List, StatusDot, type StatusTone } from "@/components/ui/List";
import { RelativeTime } from "@/components/RelativeTime";

type WorkflowRun = {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_sha: string;
  event: string;
  actor: { login: string; avatar_url: string } | null;
  run_number: number;
};

function statusOf(run: WorkflowRun): { tone: StatusTone; label: string } {
  if (run.status === "in_progress") return { tone: "warning", label: "Running" };
  if (run.status === "queued") return { tone: "warning", label: "Queued" };
  switch (run.conclusion) {
    case "success":
      return { tone: "success", label: "Success" };
    case "failure":
    case "timed_out":
    case "action_required":
      return { tone: "danger", label: "Failed" };
    case "cancelled":
      return { tone: "neutral", label: "Cancelled" };
    case "skipped":
      return { tone: "neutral", label: "Skipped" };
    default:
      return { tone: "neutral", label: "Unknown" };
  }
}

export function ActionsTab({ owner, repo }: { owner: string; repo: string }) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/github/actions?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        const data = res.ok ? await res.json() : { runs: [] };
        if (!cancelled) setRuns(data.runs || []);
      } catch {
        if (!cancelled) {
          setRuns([]);
          setError("Could not load workflow runs.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  return (
    <div>
      {error ? (
        <p role="alert" className="text-sm text-status-danger">{error}</p>
      ) : loading ? (
        <div role="status" aria-busy="true" className="flex flex-col divide-y divide-divider">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="skeleton mt-0.5 h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-text-muted">No workflow runs found.</p>
      ) : (
        <List>
          {runs.map((run) => {
            const { tone, label } = statusOf(run);
            return (
              <li key={run.id}>
                <a
                  href={run.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-3 px-4 py-3 transition-colors hover:bg-surface"
                >
                  <Workflow className="mt-0.5 h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{run.name}</span>
                      <span className="mono shrink-0 text-xs text-text-faint">#{run.run_number}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                      <span className="mono">{run.head_branch}</span>
                      <span className="mono">{run.head_sha.slice(0, 7)}</span>
                      {run.actor && <span>by {run.actor.login}</span>}
                      <span>{run.event}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <StatusDot tone={tone} pulse={run.status === "in_progress"}>{label}</StatusDot>
                    <time dateTime={run.created_at} className="text-xs text-text-faint">
                      <RelativeTime value={run.created_at} />
                    </time>
                  </div>
                </a>
              </li>
            );
          })}
        </List>
      )}
    </div>
  );
}

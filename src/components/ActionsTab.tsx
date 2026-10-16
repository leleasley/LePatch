"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Clock, Loader2, RotateCw } from "lucide-react";

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

export function ActionsTab({ owner, repo }: { owner: string; repo: string }) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/github/actions?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        const data = res.ok ? await res.json() : { runs: [] };
        if (!cancelled) setRuns(data.runs || []);
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
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_20%,transparent)] p-4">
              <div className="mb-2 h-4 w-48 rounded bg-[color-mix(in_srgb,var(--theme-text)_5%,transparent)]" />
              <div className="h-3 w-32 rounded bg-[color-mix(in_srgb,var(--theme-text)_3%,transparent)]" />
            </div>
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-[var(--theme-text-muted)]">No workflow runs found.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <a
              key={run.id}
              href={run.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_20%,transparent)] p-4 transition-colors hover:border-[var(--theme-accent-border)]"
            >
              <StatusIcon status={run.status} conclusion={run.conclusion} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--theme-text)]">
                    {run.name}
                  </span>
                  <span className="font-mono text-xs text-[var(--theme-text-muted)]">
                    #{run.run_number}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--theme-text-muted)]">
                  <span className="font-mono">{run.head_branch}</span>
                  <span className="font-mono">{run.head_sha.slice(0, 7)}</span>
                  {run.actor && <span>by {run.actor.login}</span>}
                  <span>{run.event}</span>
                  <span>{formatDate(run.created_at)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === "in_progress" || status === "queued") {
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-400" />;
  }
  if (conclusion === "success") {
    return <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />;
  }
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required") {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />;
  }
  if (conclusion === "cancelled") {
    return <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />;
  }
  return <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

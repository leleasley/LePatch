"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, MessageSquare, GitMerge } from "lucide-react";

type PullRequest = {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  html_url: string;
  created_at: string;
  user: { login: string; avatar_url: string } | null;
  labels: Array<{ name: string; color: string }>;
  comments: number;
  additions?: number;
  deletions?: number;
  changed_files?: number;
};

export function PullRequestsTab({ owner, repo }: { owner: string; repo: string }) {
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<"open" | "closed" | "all">("open");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/github/pulls?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&state=${state}`);
        const data = res.ok ? await res.json() : { pulls: [] };
        if (!cancelled) setPulls(data.pulls || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, state]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["open", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              state === s
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-white/[0.04] hover:text-text"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_30%,transparent)] p-4">
              <div className="mb-2 h-4 w-64 rounded bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]" />
              <div className="h-3 w-32 rounded bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]" />
            </div>
          ))}
        </div>
      ) : pulls.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No {state} pull requests found.</p>
      ) : (
        <div className="space-y-2">
          {pulls.map((pr) => (
            <a
              key={pr.id}
              href={pr.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_20%,transparent)] p-4 transition-colors hover:border-[var(--color-accent-border)]"
            >
              {pr.merged ? (
                <GitMerge className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
              ) : pr.state === "open" ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    #{pr.number}
                  </span>
                  <span className="truncate text-sm text-[var(--color-text)]">
                    {pr.title}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                  {pr.user && <span>by {pr.user.login}</span>}
                  <span>{formatDate(pr.created_at)}</span>
                  {pr.comments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {pr.comments}
                    </span>
                  )}
                  {pr.additions !== undefined && (
                    <span className="text-status-success">+{pr.additions}</span>
                  )}
                  {pr.deletions !== undefined && (
                    <span className="text-status-danger">-{pr.deletions}</span>
                  )}
                  {pr.labels.map((label) => (
                    <span
                      key={label.name}
                      className="rounded-full border px-2 py-0.5 text-[10px]"
                      style={{
                        borderColor: `#${label.color}40`,
                        backgroundColor: `#${label.color}15`,
                        color: `#${label.color}`,
                      }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
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

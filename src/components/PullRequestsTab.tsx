"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, MessageSquare, GitMerge } from "lucide-react";
import { List, StatusDot, type StatusTone } from "@/components/ui/List";
import { Badge } from "@/components/ui/Card";

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
  const [error, setError] = useState("");
  const [state, setState] = useState<"open" | "closed" | "all">("open");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/github/pulls?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&state=${state}`);
        const data = res.ok ? await res.json() : { pulls: [] };
        if (!cancelled) setPulls(data.pulls || []);
      } catch {
        if (!cancelled) {
          setPulls([]);
          setError("Could not load pull requests.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, state]);

  return (
    <div className="flex flex-col gap-4">
      <div className="chip-row" role="group" aria-label="Filter pull requests">
        {(["open", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            data-active={state === s}
            aria-pressed={state === s}
            onClick={() => setState(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-status-danger">{error}</p>
      ) : loading ? (
        <div role="status" aria-busy="true" className="flex flex-col divide-y divide-divider">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="skeleton mt-0.5 h-4 w-4 rounded" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : pulls.length === 0 ? (
        <p className="text-sm text-text-muted">No {state} pull requests found.</p>
      ) : (
        <List>
          {pulls.map((pr) => {
            const tone: StatusTone = pr.merged ? "accent" : pr.state === "open" ? "success" : "neutral";
            const stateLabel = pr.merged ? "Merged" : pr.state === "open" ? "Open" : "Closed";
            return (
              <li key={pr.id}>
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-start gap-3 px-4 py-3 transition-colors hover:bg-surface"
                >
                  <span className="mt-0.5 shrink-0">
                    {pr.merged ? (
                      <GitMerge className="h-4 w-4 text-accent" aria-hidden="true" />
                    ) : pr.state === "open" ? (
                      <CheckCircle className="h-4 w-4 text-status-success" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-text-faint" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="mono shrink-0 text-xs text-text-faint">#{pr.number}</span>
                      <span className="truncate text-sm font-medium text-text">{pr.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                      {pr.user && <span>by {pr.user.login}</span>}
                      <time dateTime={pr.created_at}>{formatDate(pr.created_at)}</time>
                      {pr.comments > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" aria-hidden="true" />
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
                        <Badge key={label.name} tone="neutral">{label.name}</Badge>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 pt-0.5">
                    <StatusDot tone={tone}>{stateLabel}</StatusDot>
                  </span>
                </a>
              </li>
            );
          })}
        </List>
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

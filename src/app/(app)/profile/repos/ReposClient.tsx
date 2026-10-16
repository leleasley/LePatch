"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Star, Lock, Globe } from "lucide-react";
import type { GitHubUserRepo } from "@/app/api/github/user-repos/route";

type RepoState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; repos: GitHubUserRepo[] };

export function ReposClient() {
  const [state, setState] = useState<RepoState>({ status: "loading" });

  useEffect(() => {
    fetch("/api/github/user-repos")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch (${res.status})`);
        }
        const data = await res.json();
        setState({ status: "success", repos: data.repos });
      })
      .catch((err: Error) => {
        setState({ status: "error", message: err.message });
      });
  }, []);

  if (state.status === "loading") {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-line/50 bg-panel/60 p-5">
            <div className="mb-2 h-5 w-56 rounded bg-slate-700/40" />
            <div className="mb-3 h-3 w-3/4 rounded bg-slate-700/30" />
            <div className="flex gap-4">
              <div className="h-3 w-16 rounded bg-slate-700/30" />
              <div className="h-3 w-12 rounded bg-slate-700/30" />
              <div className="h-3 w-24 rounded bg-slate-700/30" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{state.message}</p>
      </div>
    );
  }

  if (state.repos.length === 0) {
    return (
      <div className="rounded-xl border border-line/50 bg-panel/60 p-12 text-center">
        <GitBranch className="mx-auto mb-3 h-8 w-8 text-slate-500" />
        <p className="text-sm text-slate-400">No repositories found on your GitHub account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.repos.map((repo) => (
        <a
          key={repo.id}
          href={`/repos/${repo.owner.login}/${repo.name}`}
          className="group block rounded-xl border border-line/50 bg-panel/60 p-5 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/[0.02]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-white group-hover:text-cyan-300">
                  {repo.full_name}
                </h3>
                {repo.fork && (
                  <span className="shrink-0 rounded-full border border-slate-600/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                    fork
                  </span>
                )}
              </div>
              {repo.description && (
                <p className="mt-1.5 line-clamp-2 text-xs text-slate-400">{repo.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                {repo.language && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400/60" />
                    {repo.language}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {repo.stargazers_count}
                </span>
                <span className="flex items-center gap-1">
                  {repo.private ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {repo.private ? "Private" : "Public"}
                </span>
                <span>Updated {formatDate(repo.updated_at)}</span>
              </div>
            </div>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-cyan-400" />
          </div>
        </a>
      ))}
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

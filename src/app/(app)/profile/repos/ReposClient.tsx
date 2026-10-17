"use client";

import { useEffect, useState } from "react";
import { ExternalLink, GitBranch, Star, Lock, Globe } from "lucide-react";
import type { GitHubUserRepo } from "@/app/api/github/user-repos/route";
import { EmptyState, ErrorState, SkeletonRows, Badge } from "@/components/ui/Card";
import { List, ListRow, Panel, RowAvatar } from "@/components/ui/List";

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
      <Panel title="Repositories" description="Loading your GitHub repositories." flush>
        <SkeletonRows rows={6} columns={3} />
      </Panel>
    );
  }

  if (state.status === "error") {
    return (
      <ErrorState
        title="Could not load your repositories"
        description={state.message}
      />
    );
  }

  if (state.repos.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="h-4 w-4" />}
        title="No repositories found"
        description="Your connected GitHub account does not expose any repositories."
      />
    );
  }

  return (
    <Panel
      title="Repositories"
      description="Public and private repositories on your connected GitHub account."
      flush
    >
      <List>
        {state.repos.map((repo) => (
          <ListRow
            key={repo.id}
            href={`/repos/${repo.owner.login}/${repo.name}`}
            leading={
              <RowAvatar>
                <GitBranch className="h-4 w-4" aria-hidden="true" />
              </RowAvatar>
            }
            title={
              <>
                <span className="truncate text-sm font-medium text-text">{repo.full_name}</span>
                {repo.fork && <Badge tone="neutral">Fork</Badge>}
              </>
            }
            subtitle={repo.description || undefined}
            meta={
              <>
                {repo.language && (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                    {repo.language}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  {repo.stargazers_count}
                </span>
                <span className="inline-flex items-center gap-1">
                  {repo.private ? (
                    <Lock className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <Globe className="h-3 w-3" aria-hidden="true" />
                  )}
                  {repo.private ? "Private" : "Public"}
                </span>
                <span>Updated {formatDate(repo.updated_at)}</span>
              </>
            }
            trailing={<ExternalLink className="h-4 w-4 text-text-faint" aria-hidden="true" />}
          />
        ))}
      </List>
    </Panel>
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

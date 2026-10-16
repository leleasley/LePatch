"use client";

import { useEffect, useState } from "react";
import { GitBranch, Shield } from "lucide-react";

type Branch = {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
};

export function BranchesTab({ owner, repo, defaultBranch }: { owner: string; repo: string; defaultBranch: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        const data = res.ok ? await res.json() : { branches: [] };
        if (!cancelled) setBranches(data.branches || []);
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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_20%,transparent)] p-3">
              <div className="h-4 w-4 rounded bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]" />
              <div className="h-4 w-32 rounded bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No branches found.</p>
      ) : (
        <div className="space-y-1">
          {branches.map((branch) => (
            <div
              key={branch.name}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_20%,transparent)] px-4 py-3 transition-colors hover:border-[var(--color-accent-border)]"
            >
              <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-[var(--color-text)]">{branch.name}</span>
                  {branch.name === defaultBranch && (
                    <span className="rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)]">
                      default
                    </span>
                  )}
                  {branch.protected && (
                    <span className="flex items-center gap-1 text-[10px] text-status-warning">
                      <Shield className="h-3 w-3" />
                      protected
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  {branch.commit.sha.slice(0, 7)}
                </span>
              </div>
              <a
                href={`https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
              >
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

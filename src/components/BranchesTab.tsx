"use client";

import { useEffect, useState } from "react";
import { GitBranch, Shield } from "lucide-react";
import { List, ListRow } from "@/components/ui/List";
import { Badge } from "@/components/ui/Card";

type Branch = {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
};

export function BranchesTab({ owner, repo, defaultBranch }: { owner: string; repo: string; defaultBranch: string }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`);
        const data = res.ok ? await res.json() : { branches: [] };
        if (!cancelled) setBranches(data.branches || []);
      } catch {
        if (!cancelled) {
          setBranches([]);
          setError("Could not load branches.");
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
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="skeleton h-4 w-4 rounded" />
              <div className="skeleton h-4 w-32" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <p className="text-sm text-text-muted">No branches found.</p>
      ) : (
        <List>
          {branches.map((branch) => (
            <ListRow
              key={branch.name}
              leading={<GitBranch className="h-4 w-4 text-text-faint" aria-hidden="true" />}
              title={
                <>
                  <span className="mono truncate text-sm text-text">{branch.name}</span>
                  {branch.name === defaultBranch && <Badge tone="accent">default</Badge>}
                  {branch.protected && (
                    <span className="inline-flex items-center gap-1 text-xs text-status-warning">
                      <Shield className="h-3 w-3" aria-hidden="true" />
                      protected
                    </span>
                  )}
                </>
              }
              subtitle={<span className="mono">{branch.commit.sha.slice(0, 7)}</span>}
              trailing={
                <a
                  href={`https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch.name)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--ghost btn--sm"
                >
                  View
                </a>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}

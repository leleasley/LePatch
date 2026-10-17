"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { Search, Star, Loader2, PackageSearch, ArrowUpRight, X } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { AddRepoButton } from "@/components/AddRepoButton";
import { Badge, SkeletonRows } from "@/components/ui/Card";
import { List } from "@/components/ui/List";
import { Input } from "@/components/ui/Input";

type Result = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
};

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toLocaleString();
}

export function AddAppModal({
  open,
  onClose,
  watchedApps,
  canAdd = true,
}: {
  open: boolean;
  onClose: () => void;
  watchedApps: { id: string; repoFullName: string }[];
  canAdd?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchedByRepo = new Map(watchedApps.map((app) => [app.repoFullName.toLowerCase(), app.id]));

  const doSearch = useCallback(async (q: string, p: number, append: boolean) => {
    if (!q.trim() || q.trim().length < 2) return;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/github/search?q=${encodeURIComponent(q.trim())}&page=${p}`);
      if (!response.ok) {
        setError((await response.json()).error || "Search failed");
        return;
      }
      const data = await response.json();
      setResults((prev) => (append ? [...prev, ...data.results] : data.results));
      setTotalCount(data.totalCount);
      setPage(p);
      setHasSearched(true);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSearch(query, 1, false);
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length >= 2) {
      debounceRef.current = setTimeout(() => doSearch(value, 1, false), 400);
    } else {
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      setQuery("");
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      onClose();
    }
  }

  function handleLoadMore() {
    doSearch(query, page + 1, true);
  }

  /* eslint-disable react-hooks/set-state-in-effect -- reset modal search state on close */
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setTotalCount(0);
      setHasSearched(false);
      setError("");
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function repoHref(fullName: string) {
    const watchedId = watchedByRepo.get(fullName.toLowerCase());
    if (watchedId) return `/apps/${watchedId}`;
    const [owner, repo] = fullName.split("/");
    return `/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  const hasMore = results.length < totalCount;
  const hasResults = results.length > 0 && !loading;

  return (
    <ModalShell open={open} onClose={onClose} title="Add app" panelClassName="flex max-w-2xl flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-text">Add app</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="icon-button -mr-1">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 py-4" onKeyDown={handleKeyDown}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" aria-hidden="true" />
            <Input
              value={query}
              onChange={handleInputChange}
              placeholder="Search GitHub repositories"
              aria-label="Search GitHub repositories"
              data-autofocus
              className="pl-9"
            />
          </div>
          <button type="submit" disabled={loading || query.trim().length < 2} className="btn btn--primary btn--sm">
            {loading ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            Search
          </button>
        </form>

        {hasResults && (
          <p className="mt-2 text-xs text-text-muted" aria-live="polite">
            <span className="font-semibold text-text">{totalCount.toLocaleString()}</span> result
            {totalCount !== 1 ? "s" : ""} for{" "}
            <span className="mono text-text">&ldquo;{query.trim()}&rdquo;</span>
          </p>
        )}
      </div>

      <div className="max-h-[50vh] overflow-y-auto px-5 pb-5">
        {error && (
          <div role="alert" className="mb-3 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        )}

        {loading && (
          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            <SkeletonRows rows={3} columns={2} />
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="py-8 text-center">
            <PackageSearch className="mx-auto h-8 w-8 text-text-faint" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-text">No repositories found</p>
            <p className="mt-1 text-xs text-text-muted">Try a different search term.</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            <List>
              {results.map((repo) => {
                const watched = watchedByRepo.get(repo.full_name.toLowerCase());
                return (
                  <li key={repo.full_name} className="flex items-start gap-3 px-4 py-3">
                    <Link href={repoHref(repo.full_name)} onClick={onClose} className="min-w-0 flex-1">
                      <span className="mono block truncate text-sm font-medium text-text">{repo.full_name}</span>
                      <span className="mt-0.5 block truncate text-xs text-text-muted">
                        {repo.description || "No description available."}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-faint">
                        {repo.language && <Badge tone="neutral">{repo.language}</Badge>}
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3 w-3" aria-hidden="true" />
                          {formatStars(repo.stargazers_count)}
                        </span>
                        {watched && <Badge tone="success">Already watching</Badge>}
                      </span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      {watched ? (
                        <Link href={`/apps/${watched}`} onClick={onClose} className="btn btn--ghost btn--sm">
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <AddRepoButton repoFullName={repo.full_name} initialAdded={false} canAdd={canAdd} size="xs" />
                      )}
                    </div>
                  </li>
                );
              })}
            </List>
          </div>
        )}

        {loadingMore && (
          <div className="flex justify-center py-3" aria-live="polite">
            <Loader2 className="h-4 w-4 spin text-text-muted" aria-hidden="true" />
          </div>
        )}

        {!loading && hasMore && !loadingMore && (
          <div className="flex justify-center pt-3">
            <button type="button" onClick={handleLoadMore} className="btn btn--ghost btn--sm">
              Load more · {results.length} of {totalCount.toLocaleString()}
            </button>
          </div>
        )}

        {!hasSearched && !loading && (
          <div className="py-8 text-center">
            <Search className="mx-auto h-8 w-8 text-text-faint" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-text">Search open-source projects</p>
            <p className="mt-1 text-xs text-text-muted">Type at least 2 characters to search GitHub.</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

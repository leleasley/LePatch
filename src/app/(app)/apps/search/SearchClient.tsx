"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { Search, Star, Loader2, PackageSearch, ArrowUpRight, Heart } from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge, EmptyState, SkeletonRows } from "@/components/ui/Card";
import { List, ListRow, Panel, RowAvatar } from "@/components/ui/List";
import { Input } from "@/components/ui/Input";

type Result = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  sponsorLogin?: string;
};

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toLocaleString();
}

/** One search result. The repo name is the link; the add action is a sibling control. */
function ResultRow({
  repo,
  watchedId,
  href,
  canAdd,
}: {
  repo: Result;
  watchedId?: string;
  href: string;
  canAdd: boolean;
}) {
  return (
    <ListRow
      leading={<RowAvatar tone={watchedId ? "success" : "accent"}>{repo.full_name.slice(0, 1).toUpperCase()}</RowAvatar>}
      title={
        <>
          <Link href={href} className="mono truncate text-sm font-medium text-text transition-colors hover:text-accent">
            {repo.full_name}
          </Link>
          {watchedId && <Badge tone="success">Watching</Badge>}
        </>
      }
      subtitle={repo.description || "No description available."}
      meta={
        <>
          {repo.language && <Badge tone="neutral">{repo.language}</Badge>}
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3" aria-hidden="true" />
            {formatStars(repo.stargazers_count)}
          </span>
          {repo.sponsorLogin && <span>via @{repo.sponsorLogin}</span>}
        </>
      }
      trailing={
        watchedId ? (
          <Link href={`/apps/${watchedId}`} className="btn btn--ghost btn--sm">
            Open
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <AddRepoButton repoFullName={repo.full_name} initialAdded={false} canAdd={canAdd} size="xs" />
        )
      }
    />
  );
}

function SponsoredSection({
  watchedByRepo,
  repoHref,
  canAdd,
}: {
  watchedByRepo: Map<string, string>;
  repoHref: (fullName: string) => string;
  canAdd: boolean;
}) {
  const [repos, setRepos] = useState<Result[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/github/sponsored");
        if (!res.ok) {
          if (!cancelled) setError((await res.json()).error || "Could not load sponsored repos");
          return;
        }
        const data = await res.json();
        if (!cancelled) setRepos(data.repos || []);
      } catch {
        if (!cancelled) setError("Could not load sponsored repos");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (repos !== null && repos.length === 0 && !error) return null;

  return (
    <Panel
      flush
      title={
        <span className="inline-flex items-center gap-2">
          <Heart className="h-4 w-4 text-accent" aria-hidden="true" />
          From maintainers you sponsor
          {repos !== null && <span className="text-xs font-normal text-text-faint">{repos.length}</span>}
        </span>
      }
      actions={
        <button
          type="button"
          className="btn btn--subtle btn--sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Show"}
        </button>
      }
    >
      {open && (
        <div>
          {repos === null && !error && <SkeletonRows rows={2} columns={2} />}
          {error && (
            <p role="alert" className="px-4 py-4 text-sm text-status-danger">
              {error}
            </p>
          )}
          {repos !== null && repos.length === 0 && !error && (
            <p className="px-4 py-4 text-sm text-text-muted">
              No sponsorships found. When you sponsor developers on GitHub, their top repositories appear here.
            </p>
          )}
          {repos !== null && repos.length > 0 && (
            <List>
              {repos.map((repo) => (
                <ResultRow
                  key={repo.full_name}
                  repo={repo}
                  watchedId={watchedByRepo.get(repo.full_name.toLowerCase())}
                  href={repoHref(repo.full_name)}
                  canAdd={canAdd}
                />
              ))}
            </List>
          )}
        </div>
      )}
    </Panel>
  );
}

export function SearchClient({ watchedApps, canAdd = true }: { watchedApps: { id: string; repoFullName: string }[]; canAdd?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      inputRef.current?.focus();
    }
  }

  function handleLoadMore() {
    doSearch(query, page + 1, true);
  }

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
    <div className="flex flex-col gap-5" onKeyDown={handleKeyDown}>
      <PageHeader
        title="Search GitHub"
        description="Find self-hosted projects and add them to your watchlist."
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <Input
            ref={inputRef}
            value={query}
            onChange={handleInputChange}
            placeholder="Search GitHub repositories"
            aria-label="Search GitHub repositories"
            className="pl-9"
            autoFocus
          />
        </div>
        <button type="submit" disabled={loading || query.trim().length < 2} className="btn btn--primary">
          {loading ? <Loader2 className="h-4 w-4 spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Search
        </button>
      </form>

      {hasResults && (
        <p className="text-xs text-text-muted" aria-live="polite">
          <span className="font-semibold text-text">{totalCount.toLocaleString()}</span> result
          {totalCount !== 1 ? "s" : ""} for{" "}
          <span className="mono text-text">&ldquo;{query.trim()}&rdquo;</span>
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      <SponsoredSection watchedByRepo={watchedByRepo} repoHref={repoHref} canAdd={canAdd} />

      {loading && (
        <Panel flush>
          <SkeletonRows rows={4} columns={3} />
        </Panel>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <EmptyState
          icon={<PackageSearch className="h-4 w-4" />}
          title="No repositories found"
          description="Try a different search term, or check your spelling."
        />
      )}

      {!loading && results.length > 0 && (
        <Panel flush>
          <List>
            {results.map((repo) => (
              <ResultRow
                key={repo.full_name}
                repo={repo}
                watchedId={watchedByRepo.get(repo.full_name.toLowerCase())}
                href={repoHref(repo.full_name)}
                canAdd={canAdd}
              />
            ))}
          </List>
          {hasMore && (
            <div className="flex justify-center border-t border-border p-3">
              <button type="button" onClick={handleLoadMore} disabled={loadingMore} className="btn btn--ghost btn--sm">
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 spin" aria-hidden="true" />
                    Loading…
                  </>
                ) : (
                  `Load more · ${results.length} of ${totalCount.toLocaleString()}`
                )}
              </button>
            </div>
          )}
        </Panel>
      )}

      {!hasSearched && !loading && (
        <EmptyState
          icon={<Search className="h-4 w-4" />}
          title="Search open-source projects"
          description="Type at least 2 characters to search GitHub."
        />
      )}
    </div>
  );
}

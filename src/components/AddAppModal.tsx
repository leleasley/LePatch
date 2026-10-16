"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { Search, Star, ExternalLink, Loader2, PackageSearch, ArrowUpRight } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { AddRepoButton } from "@/components/AddRepoButton";

type Result = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
};

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "from-blue-400/20 to-blue-500/10 text-blue-300",
  JavaScript: "from-yellow-400/20 to-yellow-500/10 text-yellow-300",
  Python: "from-emerald-400/20 to-emerald-500/10 text-status-success",
  Go: "from-cyan-400/20 to-cyan-500/10 text-accent",
  Rust: "from-orange-400/20 to-orange-500/10 text-orange-300",
  Java: "from-red-400/20 to-red-500/10 text-status-danger",
  "C++": "from-purple-400/20 to-purple-500/10 text-purple-300",
  C: "from-slate-400/20 to-slate-500/10 text-text",
  "C#": "from-violet-400/20 to-violet-500/10 text-violet-300",
  Ruby: "from-rose-400/20 to-rose-500/10 text-rose-300",
  PHP: "from-indigo-400/20 to-indigo-500/10 text-indigo-300",
  Swift: "from-orange-300/20 to-orange-400/10 text-orange-300",
  Kotlin: "from-purple-300/20 to-purple-400/10 text-purple-300",
  Dart: "from-sky-400/20 to-sky-500/10 text-sky-300",
  Shell: "from-slate-300/20 to-slate-400/10 text-text",
  Lua: "from-blue-300/20 to-blue-400/10 text-blue-300",
};

function languageAccent(lang: string | null): string {
  if (!lang) return "from-slate-400/20 to-slate-500/10 text-text";
  return LANGUAGE_COLORS[lang] || "from-slate-400/20 to-slate-500/10 text-text";
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toLocaleString();
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="space-y-3">
        <div className="skeleton h-4 w-48" />
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-3/4" />
        <div className="flex gap-2">
          <div className="skeleton h-5 w-16" />
          <div className="skeleton h-5 w-20" />
        </div>
      </div>
    </div>
  );
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
      onClose();
    }
  }

  function handleLoadMore() {
    doSearch(query, page + 1, true);
  }

  /* eslint-disable react-hooks/set-state-in-effect -- reset modal search state on close */
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
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
    <ModalShell open={open} onClose={onClose} panelClassName="max-w-2xl">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Add app</h2>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text)] transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-5 py-4" onKeyDown={handleKeyDown}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              placeholder="Search GitHub repos… e.g. immich, home assistant"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="btn btn--primary btn--sm"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        {hasResults && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text)] font-semibold">{totalCount.toLocaleString()}</span> result
            {totalCount !== 1 ? "s" : ""} for{" "}
            <span className="font-mono text-[var(--color-text)]">"{query.trim()}"</span>
          </p>
        )}
      </div>

      <div className="max-h-[50vh] overflow-y-auto px-5 pb-5">
        {error && (
          <div className="mb-3 rounded-lg border border-[var(--theme-status-failure-border)] bg-[var(--theme-status-failure-bg)] p-3 text-sm text-[var(--color-status-danger)]">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="py-8 text-center">
            <PackageSearch className="mx-auto h-8 w-8 text-[var(--color-text-faint)]" />
            <p className="mt-2 text-sm font-medium text-[var(--color-text)]">No repositories found</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Try a different search term.</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            {results.map((repo) => {
              const watched = watchedByRepo.get(repo.full_name.toLowerCase());
              return (
                <div
                  key={repo.full_name}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 transition-all hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={repoHref(repo.full_name)}
                        onClick={onClose}
                        className="group inline-flex items-center gap-1.5 font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        <span className="font-mono text-sm">{repo.full_name}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)] line-clamp-1 leading-relaxed">
                        {repo.description || "No description available."}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {repo.language && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r ${languageAccent(repo.language)} border border-[color-mix(in_srgb,currentColor_22%,transparent)] px-2 py-0.5 text-[0.68rem] font-medium`}
                          >
                            {repo.language}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-2 py-0.5 text-[0.68rem] text-[var(--color-text-muted)]">
                          <Star className="h-2.5 w-2.5" />
                          {formatStars(repo.stargazers_count)}
                        </span>
                        {watched && (
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[0.68rem] font-medium text-status-success">
                            Already watching
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {watched ? (
                        <Link href={`/apps/${watched}`} onClick={onClose} className="btn btn--ghost btn--xs">
                          Open
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <AddRepoButton
                          repoFullName={repo.full_name}
                          initialAdded={false}
                          canAdd={canAdd}
                          size="xs"
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-text-muted)]" />
          </div>
        )}

        {!loading && hasMore && !loadingMore && (
          <div className="flex justify-center pt-2">
            <button onClick={handleLoadMore} className="btn btn--ghost btn--xs">
              Load more · {results.length} of {totalCount.toLocaleString()}
            </button>
          </div>
        )}

        {!hasSearched && !loading && (
          <div className="py-8 text-center">
            <Search className="mx-auto h-8 w-8 text-[var(--color-text-faint)]" />
            <p className="mt-2 text-sm font-medium text-[var(--color-text)]">Search open-source projects</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Type at least 2 characters to search GitHub.</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

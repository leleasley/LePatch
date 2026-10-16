"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { Search, Star, ExternalLink, Loader2, PackageSearch, ArrowUpRight, Heart } from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";

type Result = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  sponsorLogin?: string;
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
    <div className="app-shell-card p-4 sm:p-5">
      <div className="flex justify-between gap-3">
        <div className="flex-1 space-y-3">
          <div className="skeleton h-4 w-48" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
          <div className="flex gap-2 mt-1">
            <div className="skeleton h-5 w-16" />
            <div className="skeleton h-5 w-20" />
          </div>
        </div>
        <div className="skeleton h-9 w-24 shrink-0" />
      </div>
    </div>
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
    <section className="app-shell-card p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Heart className="h-4 w-4 text-pink-400" />
        <span className="font-semibold text-[var(--color-text)]">From maintainers you sponsor</span>
        {repos !== null && (
          <span className="text-xs text-[var(--color-text-faint)]">{repos.length}</span>
        )}
        <span className="ml-auto text-xs text-[var(--color-text-faint)]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3">
          {repos === null && !error && (
            <div className="grid gap-3">
              <SkeletonCard />
            </div>
          )}
          {error && (
            <p className="text-sm text-[var(--color-text-muted)]">
              {error}
            </p>
          )}
          {repos !== null && repos.length === 0 && !error && (
            <p className="text-sm text-[var(--color-text-muted)]">
              No sponsorships found — when you sponsor developers on GitHub, their top repos will appear here.
            </p>
          )}
          {repos !== null && repos.length > 0 && (
            <div className="grid gap-3">
              {repos.map((repo) => {
                const watched = watchedByRepo.get(repo.full_name.toLowerCase());
                return (
                  <div
                    key={repo.full_name}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_40%,transparent)] p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={repoHref(repo.full_name)}
                        className="group inline-flex items-center gap-2 font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        <span className="app-mono text-[0.9rem]">{repo.full_name}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)] line-clamp-2">
                        {repo.description || "No description available."}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {repo.language && (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${languageAccent(repo.language)} border border-[color-mix(in_srgb,currentColor_22%,transparent)] px-2.5 py-0.5 text-xs font-medium`}
                          >
                            {repo.language}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-[0.78rem] text-[var(--color-text-muted)]">
                          <Star className="h-3 w-3" />
                          {formatStars(repo.stargazers_count)}
                        </span>
                        {repo.sponsorLogin && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-pink-500/30 bg-pink-500/10 px-2.5 py-0.5 text-[0.78rem] text-pink-300">
                            <Heart className="h-3 w-3" />
                            via @{repo.sponsorLogin}
                          </span>
                        )}
                        {watched && (
                          <span className="status-pill status-pill--success" style={{ padding: "0.15rem 0.55rem", fontSize: "0.7rem" }}>
                            Already watching
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-text-faint)]">
                        Tip: enable “Include prereleases” when watching to get Telegram alerts for pre-releases too.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {watched ? (
                        <Link href={`/apps/${watched}`} className="btn btn--ghost btn--sm">
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <AddRepoButton
                          repoFullName={repo.full_name}
                          initialAdded={false}
                          canAdd={canAdd}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
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
    <div className="space-y-5" onKeyDown={handleKeyDown}>
      <section className="app-hero app-hero--compact p-5 sm:p-7">
        <h1 className="app-display-title">Search GitHub</h1>
        <p className="app-display-subtitle mt-2.5">
          Find self-hosted projects and add them to your watchlist.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              placeholder="Try “immich”, “home assistant”, “nextcloud”…"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_60%,transparent)] py-3 pl-11 pr-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="btn btn--primary"
          >
            {loading ? <Loader2 className="h-4 w-4 spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        {hasResults && (
          <p className="mt-3 text-[0.78rem] text-[var(--color-text-muted)]">
            <span className="text-[var(--color-text)] font-semibold">{totalCount.toLocaleString()}</span> result
            {totalCount !== 1 ? "s" : ""} for{" "}
            <span className="app-mono text-[var(--color-text)]">"{query.trim()}"</span>
          </p>
        )}
      </section>

      {error && (
        <div className="rounded-xl border border-[var(--theme-status-failure-border)] bg-[var(--theme-status-failure-bg)] p-4 text-sm text-[var(--color-status-danger)]">
          {error}
        </div>
      )}

      <SponsoredSection watchedByRepo={watchedByRepo} repoHref={repoHref} canAdd={canAdd} />

      {loading && (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <div className="empty-state">
          <span className="empty-state-icon">
            <PackageSearch className="h-5 w-5" />
          </span>
          <p className="empty-state-title">No repositories found</p>
          <p className="empty-state-copy">Try a different search term, or check your spelling.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="grid gap-3">
            {results.map((repo) => {
              const watched = watchedByRepo.get(repo.full_name.toLowerCase());
              return (
                <div
                  key={repo.full_name}
                  className="app-shell-card p-4 sm:p-5 transition-all hover:border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={repoHref(repo.full_name)}
                        className="group inline-flex items-center gap-2 font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        <span className="app-mono text-[0.95rem]">{repo.full_name}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                      <p className="mt-1.5 text-sm text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                        {repo.description || "No description available."}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {repo.language && (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${languageAccent(repo.language)} border border-[color-mix(in_srgb,currentColor_22%,transparent)] px-2.5 py-0.5 text-xs font-medium`}
                          >
                            {repo.language}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-2.5 py-0.5 text-[0.78rem] text-[var(--color-text-muted)]">
                          <Star className="h-3 w-3" />
                          {formatStars(repo.stargazers_count)}
                        </span>
                        {watched && (
                          <span className="status-pill status-pill--success" style={{ padding: "0.15rem 0.55rem", fontSize: "0.7rem" }}>
                            Already watching
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {watched ? (
                        <Link href={`/apps/${watched}`} className="btn btn--ghost btn--sm">
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : (
                        <AddRepoButton
                          repoFullName={repo.full_name}
                          initialAdded={false}
                          canAdd={canAdd}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button onClick={handleLoadMore} disabled={loadingMore} className="btn btn--ghost">
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 spin" />
                    Loading...
                  </>
                ) : (
                  `Load more · ${results.length} of ${totalCount.toLocaleString()}`
                )}
              </button>
            </div>
          )}
        </>
      )}

      {!hasSearched && !loading && (
        <div className="empty-state">
          <span className="empty-state-icon">
            <Search className="h-5 w-5" />
          </span>
          <p className="empty-state-title">Search open-source projects</p>
          <p className="empty-state-copy">Type at least 2 characters to search GitHub.</p>
        </div>
      )}
    </div>
  );
}

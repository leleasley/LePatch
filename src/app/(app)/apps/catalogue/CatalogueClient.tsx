"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Star, X, LayoutGrid } from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
import { SpotlightCard } from "./SpotlightCard";
import { AppCard } from "./AppCard";
import { SuggestAppButton } from "./SuggestAppButton";
import type { EnrichedEntry } from "./AppCard";

interface TrendingRepo {
  fullName: string;
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  htmlUrl: string;
}

interface CommunityRepo {
  fullName: string;
  name: string;
  description: string | null;
  stars: number;
  language: string | null;
  htmlUrl: string;
  homepage: string | null;
  topics: string[];
}

interface CatalogueClientProps {
  entries: EnrichedEntry[];
  watchedByRepo: Record<string, { id: string; repoFullName: string; name: string; latestSeenTag: string | null; catalogueEntryId: string | null }>;
  trendingRepos: TrendingRepo[];
  communityRepos: CommunityRepo[];
  canAdd?: boolean;
}

const CATEGORIES = [
  { key: "", label: "All" },
  { key: "media", label: "Media" },
  { key: "identity", label: "Identity" },
  { key: "monitoring", label: "Monitoring" },
  { key: "infrastructure", label: "Infrastructure" },
  { key: "documents", label: "Documents" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name (A-Z)" },
  { value: "recent", label: "Recently added" },
  { value: "stars", label: "GitHub stars" },
  { value: "popular", label: "Most installed" },
  { value: "updated", label: "Recently updated" },
] as const;

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function CatalogueClient({ entries, watchedByRepo, trendingRepos, communityRepos, canAdd = true }: CatalogueClientProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [spotlightIdx, setSpotlightIdx] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  const featured = useMemo(() => entries.filter((e) => e.featured), [entries]);

  const spotlight = useMemo(() => {
    if (featured.length > 0) return featured[spotlightIdx % featured.length];
    return entries[0] || null;
  }, [featured, entries, spotlightIdx]);

  const filtered = useMemo(() => {
    let result = [...entries];

    if (category) result = result.filter((e) => e.category === category);
    if (verifiedOnly) result = result.filter((e) => e.verified);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.repoFullName.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case "stars":
        result.sort((a, b) => (b.githubStars ?? 0) - (a.githubStars ?? 0));
        break;
      case "popular":
        result.sort((a, b) => b.installCount - a.installCount);
        break;
      case "recent":
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "updated":
        result.sort(
          (a, b) =>
            (b.latestReleaseAt ? new Date(b.latestReleaseAt).getTime() : 0) -
            (a.latestReleaseAt ? new Date(a.latestReleaseAt).getTime() : 0)
        );
        break;
      default:
        result.sort((a, b) => a.name.localeCompare(b.name));
    }
    return result;
  }, [entries, search, category, sort, verifiedOnly]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
    return counts;
  }, [entries]);

  const watchedList = useMemo(() => Object.values(watchedByRepo), [watchedByRepo]);

  const hasFilters = category || verifiedOnly || search;

  return (
    <>
      <HeroCard
        compact
        icon={<LayoutGrid className="h-5 w-5" />}
        title={`${entries.length} app${entries.length === 1 ? "" : "s"} in catalogue`}
        subtitle="Browse curated self-hosted apps, or search GitHub for any repository."
      />

      {watchedList.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {watchedList.map((app) => (
            <Link
              key={app.id}
              href={`/apps/${app.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--theme-status-success-bg)] border border-[var(--theme-status-success-border)] px-2.5 py-1.5 text-xs text-[var(--theme-status-success)] transition-colors hover:bg-[color-mix(in_srgb,var(--theme-status-success)_22%,transparent)]"
            >
              {app.name}
              {app.latestSeenTag && (
                <span className="app-mono text-[0.7rem] opacity-70">{app.latestSeenTag}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {spotlight && <SpotlightCard entry={spotlight} onNext={() => setSpotlightIdx((i) => i + 1)} canAdd={canAdd} />}

      <section className="mt-5 app-shell-card p-3.5 sm:p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="chip-row sm:flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                data-active={category === c.key}
                className="chip"
              >
                {c.label}
                <span className="text-[0.7rem] opacity-70">{categoryCounts[c.key] || 0}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className="btn btn--ghost btn--sm lg:hidden"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--theme-text-faint)]" />
              <input
                type="text"
                placeholder="Search catalogue…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] py-2 pl-9 pr-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-text-faint)] focus:border-[var(--theme-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] transition-all sm:w-56"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--theme-text-faint)] hover:bg-[color-mix(in_srgb,var(--theme-text)_5%,transparent)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setVerifiedOnly(!verifiedOnly)}
              data-active={verifiedOnly}
              className="chip"
            >
              Verified
            </button>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-2.5 py-2 text-sm text-[var(--theme-text)] focus:border-[var(--theme-accent-border)] focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 lg:hidden">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategory(c.key);
                  setShowFilters(false);
                }}
                data-active={category === c.key}
                className="chip justify-between w-full"
              >
                <span>{c.label}</span>
                <span className="text-[0.7rem] opacity-70">{categoryCounts[c.key] || 0}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--theme-text-faint)]">
          <span>
            <span className="text-[var(--theme-text)] font-semibold">{filtered.length}</span> app
            {filtered.length !== 1 ? "s" : ""}
            {hasFilters && " matching filters"}
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setCategory("");
                setSearch("");
                setVerifiedOnly(false);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--theme-line)] px-1.5 py-0.5 hover:border-[var(--theme-text-faint)]"
            >
              Clear <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </section>

      {filtered.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {filtered.map((entry) => (
            <AppCard key={entry.id} entry={entry} canAdd={canAdd} />
          ))}
        </div>
      ) : (
        <div className="mt-4 empty-state">
          <span className="empty-state-icon">
            <Search className="h-5 w-5" />
          </span>
          <p className="empty-state-title">No apps found</p>
          <p className="empty-state-copy">Try a different filter, or suggest an app to add it.</p>
        </div>
      )}

      {trendingRepos.length > 0 && (
        <section className="mt-8">
          <div className="section-heading">
            <h2>Trending on GitHub</h2>
            <span className="section-heading-meta">randomised each visit</span>
          </div>
          <div className="space-y-2">
            {trendingRepos.map((repo) => (
              <Link
                key={repo.fullName}
                href={`/apps/repo/${encodeURIComponent(repo.fullName.split("/")[0])}/${encodeURIComponent(repo.fullName.split("/")[1])}`}
                className="app-shell-card block p-3.5 transition-all hover:border-[color-mix(in_srgb,var(--theme-accent)_30%,transparent)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--theme-text)]">{repo.name}</span>
                      {repo.language && (
                        <span className="rounded-full border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-2 py-0.5 text-[0.7rem] text-[var(--theme-text-muted)]">
                          {repo.language}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--theme-text-muted)] line-clamp-1">{repo.description || "No description"}</p>
                    <p className="mt-1 app-mono text-[0.7rem] text-[var(--theme-text-faint)]">{repo.fullName}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[0.78rem] text-[var(--theme-text-muted)] shrink-0">
                    <Star className="h-3 w-3" />
                    {formatStars(repo.stars)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {communityRepos.length > 0 && (
        <section className="mt-8">
          <div className="section-heading">
            <h2>Proxmox community scripts</h2>
            <a
              href="https://community-scripts.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.78rem] text-[var(--theme-accent)] hover:text-[var(--theme-accent-hover)] transition-colors"
            >
              community-scripts.org →
            </a>
          </div>
          <div className="space-y-2">
            {communityRepos.map((repo) => (
              <Link
                key={repo.fullName}
                href={`/apps/repo/${encodeURIComponent(repo.fullName.split("/")[0])}/${encodeURIComponent(repo.fullName.split("/")[1])}`}
                className="app-shell-card block p-3.5 transition-all hover:border-[color-mix(in_srgb,var(--theme-status-success)_30%,transparent)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--theme-text)]">{repo.name}</span>
                      {repo.language && (
                        <span className="rounded-full border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-2 py-0.5 text-[0.7rem] text-[var(--theme-text-muted)]">
                          {repo.language}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--theme-text-muted)] line-clamp-1">{repo.description || "No description"}</p>
                    {repo.topics.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {repo.topics.slice(0, 5).map((topic) => (
                          <span
                            key={topic}
                            className="rounded-md border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_30%,transparent)] px-1.5 py-0.5 text-[0.65rem] text-[var(--theme-text-muted)]"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[0.78rem] text-[var(--theme-text-muted)] shrink-0">
                    <Star className="h-3 w-3" />
                    {formatStars(repo.stars)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 flex justify-end">
        {canAdd && <SuggestAppButton />}
      </div>
    </>
  );
}

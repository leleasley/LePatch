"use client";

import Link from "next/link";
import { Star, RefreshCw, ArrowUpRight, Sparkles } from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";
import { categoryLabel, categoryClass } from "./categories";
import type { EnrichedEntry } from "./AppCard";

function spotlightHref(entry: EnrichedEntry) {
  if (entry.isWatched && entry.watchedAppId) return `/apps/${entry.watchedAppId}`;
  const [owner, repo] = entry.repoFullName.split("/");
  return `/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function SpotlightCard({ entry, onNext, canAdd = true }: { entry: EnrichedEntry; onNext: () => void; canAdd?: boolean }) {
  return (
    <section className="app-hero app-hero--compact p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-faint)]">
          <Sparkles className="h-3.5 w-3.5" /> Spotlight
        </span>
        <span className={categoryClass(entry.category)}>{categoryLabel(entry.category)}</span>
      </div>
      <Link href={spotlightHref(entry)} className="block mt-3 group">
        <h2 className="app-display-title">{entry.name}</h2>
        <p className="app-display-subtitle mt-2">{entry.description}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.78rem] text-[var(--theme-text-muted)]">
          {entry.githubStars != null && (
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-[var(--theme-status-pending)]" />
              <span className="text-[var(--theme-text)] font-medium">{entry.githubStars.toLocaleString()}</span>
              <span className="text-[var(--theme-text-faint)]">stars</span>
            </span>
          )}
          {entry.latestReleaseTag && (
            <span className="app-mono inline-flex items-center gap-1 rounded-md border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-2 py-0.5 text-[0.78rem] text-[var(--theme-text)]">
              v{entry.latestReleaseTag}
            </span>
          )}
          <span className="app-mono text-[var(--theme-text-faint)]">{entry.repoFullName}</span>
        </div>
        <span className="mt-2 inline-flex items-center gap-1 text-[0.78rem] text-[var(--theme-accent)] opacity-0 group-hover:opacity-100 transition-opacity">
          View <ArrowUpRight className="h-3 w-3" />
        </span>
      </Link>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <AddRepoButton
          repoFullName={entry.repoFullName}
          name={entry.name}
          initialAdded={entry.isWatched}
          appId={entry.watchedAppId || undefined}
          catalogueEntryId={entry.id}
          canAdd={canAdd}
        />
        <button
          type="button"
          onClick={onNext}
          className="btn btn--ghost btn--sm"
          title="Next spotlight"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Next
        </button>
      </div>
    </section>
  );
}

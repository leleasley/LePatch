"use client";

import Link from "next/link";
import { Star, ArrowUpRight, Check, Server } from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";
import { categoryLabel, categoryClass } from "./categories";

export interface EnrichedEntry {
  id: string;
  name: string;
  repoFullName: string;
  description: string;
  category: string;
  packageNames: string[];
  homepageUrl: string | null;
  logoUrl: string | null;
  featured: boolean;
  featuredOrder: number | null;
  isActive: boolean;
  installCount: number;
  addCount: number;
  githubStars: number | null;
  latestReleaseTag: string | null;
  latestReleaseAt: string | null;
  githubStatsAt: string | null;
  createdAt: string;
  updatedAt: string;
  isWatched: boolean;
  watchedAppId: string | null;
  verified?: boolean;
}

function repoHref(entry: EnrichedEntry) {
  if (entry.isWatched && entry.watchedAppId) return `/apps/${entry.watchedAppId}`;
  const [owner, repo] = entry.repoFullName.split("/");
  return `/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(iso).toLocaleDateString();
}

function formatStars(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export function AppCard({ entry, canAdd = true }: { entry: EnrichedEntry; canAdd?: boolean }) {
  const href = repoHref(entry);
  const ago = timeAgo(entry.latestReleaseAt);
  const stars = formatStars(entry.githubStars);

  return (
    <div className="app-shell-card p-4 sm:p-5 transition-all hover:border-[color-mix(in_srgb,var(--theme-accent)_30%,transparent)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="group inline-flex items-center gap-1.5 text-base font-semibold text-[var(--theme-text)] hover:text-[var(--theme-accent)] transition-colors"
            >
              {entry.name}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            {entry.verified && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent-bg)] border border-[var(--theme-accent-border)] px-1.5 py-0.5 text-[0.65rem] font-semibold text-[var(--theme-accent)] uppercase tracking-wider"
                title="Verified package mapping"
              >
                <Check className="h-2.5 w-2.5" /> verified
              </span>
            )}
            {entry.isWatched && (
              <span className="status-pill status-pill--success" style={{ padding: "0.15rem 0.55rem", fontSize: "0.7rem" }}>
                <Check className="h-2.5 w-2.5" /> watching
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-[var(--theme-text-muted)] line-clamp-2 leading-relaxed">
            {entry.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={categoryClass(entry.category)}>{categoryLabel(entry.category)}</span>
            {stars && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-2 py-0.5 text-[0.7rem] text-[var(--theme-text-muted)]">
                <Star className="h-3 w-3" />
                {stars}
              </span>
            )}
            {entry.latestReleaseTag && (
              <span className="app-mono text-[0.7rem] text-[var(--theme-text-muted)]">
                v{entry.latestReleaseTag}
                {ago && <span className="text-[var(--theme-text-faint)]"> · {ago}</span>}
              </span>
            )}
            {entry.installCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[0.7rem] text-[var(--theme-text-faint)]">
                <Server className="h-3 w-3" />
                on {entry.installCount} server{entry.installCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <AddRepoButton
            repoFullName={entry.repoFullName}
            name={entry.name}
            initialAdded={entry.isWatched}
            appId={entry.watchedAppId || undefined}
            catalogueEntryId={entry.id}
            size="xs"
            canAdd={canAdd}
          />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import {
  ExternalLink,
  Globe,
  Star,
  Tag,
  Code2,
  GitBranch,
  GitFork,
  Eye,
  ArrowUpRight,
} from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";
import { AppDetailTabs, type AppTab } from "@/components/AppDetailTabs";
import { HeroCard } from "@/components/HeroCard";
import { StatPill } from "@/components/StatPill";
import { requirePageCanBrowseApps } from "@/lib/auth";
import { canManageApps } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRepoSnapshot } from "@/lib/repo-snapshot";
import { isNotFoundError } from "@/lib/github";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePageCanBrowseApps();
  const canAdd = canManageApps(user.role);
  const { owner, repo } = await params;
  const { tab } = await searchParams;
  const repoFullName = `${owner}/${repo}`;

  const [snapshot, watchedApp] = await Promise.all([
    getRepoSnapshot(owner, repo, { userId: user.id }).catch((error) => {
      // Private repo the viewer can't see (or that doesn't exist) → 404 page
      // instead of a 500. The snapshot layer already retried with the
      // viewer's own GitHub token before giving up.
      if (isNotFoundError(error)) notFound();
      throw error;
    }),
    canAdd
      ? prisma.watchedApp.findUnique({
          where: { userId_repoFullName: { userId: user.id, repoFullName } },
          select: { id: true, name: true, latestSeenTag: true, updateAvailable: true },
        })
      : Promise.resolve(null),
  ]);

  const repoData = snapshot.repo;
  const visibleReleases = snapshot.releases;
  const activeTab: AppTab = (["readme", "files", "releases", "issues", "commits", "pulls", "branches", "actions"] as string[]).includes(tab || "")
    ? (tab as AppTab)
    : "readme";

  const displayReleases = visibleReleases.map((release) => ({
    id: `github-${release.id}`,
    tagName: release.tag_name,
    name: release.name,
    body: release.body,
    htmlUrl: release.html_url,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.published_at ? new Date(release.published_at) : null,
    detectedAt: new Date(snapshot.cachedAt),
    ignored: false,
    notificationSent: false,
  }));
  const displayLatestRelease = displayReleases[0] || null;

  return (
    <>
      <HeroCard
        icon={<Code2 className="h-5 w-5" />}
        kicker="Repository preview"
        title={repoData.name}
        subtitle={repoData.description || "No description available."}
        badges={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-2.5 py-1 text-[0.78rem] text-[var(--color-text-muted)]">
              <GitFork className="h-3 w-3" />
              <span className="app-mono">{repoData.full_name}</span>
            </span>
            {watchedApp ? (
              <span className="status-pill status-pill--success" style={{ background: "var(--theme-status-success-bg)", color: "var(--color-status-success)" }}>
                <Eye className="h-3 w-3" />
                Watching · {watchedApp.name}
              </span>
            ) : (
              <span className="status-pill status-pill--neutral">Not watched</span>
            )}
            {repoData.language && (
              <span className="status-pill status-pill--neutral">{repoData.language}</span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {watchedApp ? (
              <Link href={`/apps/${watchedApp.id}`} className="btn btn--primary btn--sm">
                Open watched app
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <AddRepoButton
                repoFullName={repoData.full_name}
                name={repoData.name}
                initialAdded={false}
                canAdd={canAdd}
              />
            )}
            <a
              href={repoData.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              GitHub
            </a>
            {repoData.homepage && (
              <a
                href={repoData.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--ghost btn--sm"
              >
                <Globe className="h-3.5 w-3.5" />
                Homepage
              </a>
            )}
          </div>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatPill icon={<Star className="h-3 w-3" />} label="Stars" value={repoData.stargazers_count.toLocaleString()} />
        <StatPill icon={<Tag className="h-3 w-3" />} label="Releases" value={visibleReleases.length} />
        <StatPill icon={<GitBranch className="h-3 w-3" />} label="Branch" value={repoData.default_branch} />
        <StatPill icon={<Code2 className="h-3 w-3" />} label="Language" value={repoData.language || "—"} />
      </div>

      {watchedApp && (
        <section className="mt-5 app-shell-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                In your watchlist
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-text)]">
                <span className="font-medium">{watchedApp.name}</span>
                {watchedApp.latestSeenTag && (
                  <>
                    {" "}· <span className="app-mono text-[var(--color-text-muted)]">{watchedApp.latestSeenTag}</span>
                  </>
                )}
                {watchedApp.updateAvailable && (
                  <span className="ml-1.5 text-[var(--color-status-warning)]">· update available</span>
                )}
              </p>
            </div>
            <Link href={`/apps/${watchedApp.id}`} className="btn btn--ghost btn--sm">
              Open
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      )}

      <div className="mt-5">
        <AppDetailTabs
          owner={owner}
          repo={repo}
          activeTab={activeTab}
          tabBaseUrl={`/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
          snapshot={snapshot}
          releases={displayReleases}
          latestRelease={displayLatestRelease}
          previousTag={null}
          updateAvailable={Boolean(watchedApp?.updateAvailable)}
          mode="preview"
        />
      </div>
    </>
  );
}

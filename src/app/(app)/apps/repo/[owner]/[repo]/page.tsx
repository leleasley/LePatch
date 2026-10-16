import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Code2, ExternalLink, Eye, GitBranch, GitFork, Globe, Star } from "lucide-react";
import { AddRepoButton } from "@/components/AddRepoButton";
import { AppDetailTabs, type AppTab } from "@/components/AppDetailTabs";
import { PageHeader, MetaItem } from "@/components/ui/PageHeader";
import { MetricStrip, StatusDot } from "@/components/ui/List";
import { requirePageCanBrowseApps } from "@/lib/auth";
import { canManageApps } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRepoSnapshot } from "@/lib/repo-snapshot";
import { isNotFoundError } from "@/lib/github";

export const dynamic = "force-dynamic";

const TAB_KEYS = ["readme", "files", "releases", "issues", "commits", "pulls", "branches", "actions"];

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
      // instead of a 500. The snapshot layer already retried with the viewer's
      // own GitHub token before giving up.
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
  const activeTab = (TAB_KEYS.includes(tab ?? "") ? tab : "releases") as AppTab;

  const displayReleases = snapshot.releases.map((release) => ({
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

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Find repositories", href: "/apps/search" }, { label: repoFullName }]}
        title={repoData.name}
        description={repoData.description || "No repository description."}
        meta={
          <>
            <a
              href={repoData.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="mono">{repoData.full_name}</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <MetaItem icon={<Star className="h-3.5 w-3.5" />}>{repoData.stargazers_count.toLocaleString()}</MetaItem>
            {repoData.language && <MetaItem icon={<Code2 className="h-3.5 w-3.5" />}>{repoData.language}</MetaItem>}
            <MetaItem icon={<GitBranch className="h-3.5 w-3.5" />}>{repoData.default_branch}</MetaItem>
          </>
        }
        actions={
          <>
            {watchedApp ? (
              <Link href={`/apps/${watchedApp.id}`} className="btn btn--primary btn--sm">
                Open watched repository
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ) : (
              <AddRepoButton repoFullName={repoData.full_name} name={repoData.name} initialAdded={false} canAdd={canAdd} />
            )}
            <a href={repoData.html_url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
              GitHub
            </a>
            {repoData.homepage && (
              <a href={repoData.homepage} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                Homepage
              </a>
            )}
          </>
        }
      />

      <div className="mb-5">
        <MetricStrip
          items={[
            { label: "Stars", value: repoData.stargazers_count.toLocaleString() },
            { label: "Releases", value: snapshot.releases.length },
            { label: "Default branch", value: repoData.default_branch },
            { label: "Language", value: repoData.language ?? "—" },
          ]}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-panel px-4 py-3">
        {watchedApp ? (
          <StatusDot tone="success">
            <Eye className="h-3 w-3" aria-hidden="true" /> Watching as {watchedApp.name}
          </StatusDot>
        ) : (
          <StatusDot tone="neutral">Not in your watchlist</StatusDot>
        )}
        {watchedApp?.latestSeenTag && <StatusDot tone="neutral">Latest seen {watchedApp.latestSeenTag}</StatusDot>}
        {watchedApp?.updateAvailable && <StatusDot tone="warning" pulse>Update available</StatusDot>}
      </div>

      <AppDetailTabs
        owner={owner}
        repo={repo}
        activeTab={activeTab}
        tabBaseUrl={`/apps/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
        snapshot={snapshot}
        releases={displayReleases}
        latestRelease={displayReleases[0] ?? null}
        previousTag={null}
        updateAvailable={Boolean(watchedApp?.updateAvailable)}
        mode="preview"
      />
    </>
  );
}

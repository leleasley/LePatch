import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Globe,
  Star,
  Tag,
  Code2,
  GitBranch,
  GitFork,
} from "lucide-react";
import { AppDetailTabs, type AppTab } from "@/components/AppDetailTabs";
import { HeroCard } from "@/components/HeroCard";
import { StatPill } from "@/components/StatPill";
import { requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserRepoSnapshot } from "@/lib/user-repo-snapshot";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo}` };
}

export default async function RepoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ owner: string; repo: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requirePageSession();
  const { owner, repo } = await params;
  const { tab } = await searchParams;

  const link = await prisma.gitHubLink.findUnique({
    where: { userId: session.userId },
    select: { id: true },
  });

  if (!link) notFound();

  let snapshot;
  try {
    snapshot = await getUserRepoSnapshot(session.userId, owner, repo);
  } catch {
    notFound();
  }

  const repoData = snapshot.repo;
  const visibleReleases = snapshot.releases;

  const activeTab: AppTab = (["readme", "files", "releases", "issues", "commits", "pulls", "branches", "actions"] as string[]).includes(tab || "")
    ? (tab as AppTab)
    : snapshot.readme ? "readme" : "files";

  const displayReleases = visibleReleases.map((release) => ({
    id: `github-${release.id}`,
    tagName: release.tag_name,
    name: release.name,
    body: release.body,
    htmlUrl: release.html_url,
    prerelease: release.prerelease,
    draft: false,
    publishedAt: release.published_at ? new Date(release.published_at) : null,
    detectedAt: new Date(snapshot.cachedAt),
    ignored: false,
    notificationSent: false,
  }));
  const displayLatestRelease = displayReleases[0] || null;

  return (
    <>
      <Link
        href="/profile/repos"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to my repositories
      </Link>

      <HeroCard
        icon={<Code2 className="h-5 w-5" />}
        kicker="Your repository"
        title={repoData.full_name.split("/")[1]}
        subtitle={repoData.description || "No description available."}
        badges={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-2.5 py-1 text-[0.78rem] text-[var(--color-text-muted)]">
              <GitFork className="h-3 w-3" />
              <span className="app-mono">{repoData.full_name}</span>
            </span>
            {repoData.language && (
              <span className="status-pill status-pill--neutral">{repoData.language}</span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
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

      <div className="mt-5">
        <AppDetailTabs
          owner={owner}
          repo={repo}
          activeTab={activeTab}
          tabBaseUrl={`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`}
          snapshot={snapshot}
          releases={displayReleases}
          latestRelease={displayLatestRelease}
          previousTag={null}
          updateAvailable={false}
          mode="preview"
        />
      </div>
    </>
  );
}

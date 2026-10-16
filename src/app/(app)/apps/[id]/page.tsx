import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellOff,
  Code2,
  ExternalLink,
  GitBranch,
  GitFork,
  RefreshCw,
  Star,
  Tag,
} from "lucide-react";
import { AppActions, DisableNotificationsButton, RemoveAppButton } from "@/components/ActionButtons";
import { AppDetailTabs, type AppTab } from "@/components/AppDetailTabs";
import { ClearPendingAppName } from "@/components/ClearPendingAppName";
import { EditAppModal } from "@/components/EditAppModal";
import { PageHeader, MetaItem } from "@/components/ui/PageHeader";
import { MetricStrip, Panel, StatusDot, type StatusTone } from "@/components/ui/List";
import { prisma } from "@/lib/prisma";
import { getRepoSnapshot } from "@/lib/repo-snapshot";
import { getCurrentPageUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/time-ago";

export const dynamic = "force-dynamic";

const TAB_KEYS = ["readme", "files", "releases", "issues", "commits", "pulls", "branches", "actions"];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentPageUser().catch(() => null);
  const app = currentUser
    ? await prisma.watchedApp.findUnique({ where: { id, userId: currentUser.id }, select: { name: true } })
    : null;
  return { title: app ? app.name : "Repository" };
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Number((minutes / 60).toFixed(minutes % 60 ? 1 : 0))}h`;
  return `${Number((minutes / 1440).toFixed(1))}d`;
}

function checkState(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "failed":
      return { label: "Check failed", tone: "danger" };
    case "success":
      return { label: "Checks passing", tone: "success" };
    case "no_releases":
      return { label: "No releases published", tone: "neutral" };
    default:
      return { label: "Not checked yet", tone: "neutral" };
  }
}

export default async function AppDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const currentUser = await getCurrentPageUser();

  const app = await prisma.watchedApp.findUnique({
    where: { id, userId: currentUser.id },
    include: {
      releases: { orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }], take: 50 },
    },
  });
  if (!app) notFound();

  const activeTab = (TAB_KEYS.includes(tab ?? "") ? tab : "readme") as AppTab;

  // Private repos resolve via the viewer's own token. If GitHub is unreachable,
  // degrade to stored releases rather than failing the page.
  let snapshot;
  try {
    snapshot = await getRepoSnapshot(app.repoOwner, app.repoName, { userId: currentUser.id });
  } catch {
    snapshot = {
      repo: {
        html_url: app.githubUrl,
        full_name: app.repoFullName,
        default_branch: "main",
        description: app.description,
        stargazers_count: 0,
        language: null,
        homepage: app.homepageUrl,
      },
      releases: [],
      files: [],
      readme: null,
      cachedAt: new Date().toISOString(),
    };
  }

  const storedReleasesByGitHubId = new Map(app.releases.map((release) => [release.githubReleaseId, release]));
  const githubReleases =
    snapshot.releases.length > 0
      ? snapshot.releases
      : app.releases.map((release) => ({
          id: Number(release.githubReleaseId),
          tag_name: release.tagName,
          name: release.name,
          body: release.body,
          html_url: release.htmlUrl,
          prerelease: release.prerelease,
          draft: release.draft,
          published_at: release.publishedAt ? release.publishedAt.toISOString() : null,
        }));

  const displayReleases = githubReleases.map((release) => {
    const stored = storedReleasesByGitHubId.get(String(release.id));
    return {
      id: stored?.id ?? `github-${release.id}`,
      tagName: release.tag_name,
      name: release.name,
      body: stored?.body ?? release.body,
      htmlUrl: release.html_url,
      prerelease: release.prerelease,
      draft: release.draft,
      publishedAt: release.published_at ? new Date(release.published_at) : null,
      detectedAt: stored?.detectedAt ?? new Date(snapshot.cachedAt),
      ignored: stored?.ignored ?? false,
      notificationSent: stored?.notificationSent ?? false,
      releaseType: stored?.releaseType ?? null,
    };
  });

  const latestRelease = displayReleases[0] ?? null;
  const previousTag = displayReleases[1]?.tagName ?? null;
  const check = checkState(app.checkStatus);

  return (
    <>
      <ClearPendingAppName />

      <PageHeader
        breadcrumb={[{ label: "Watched repositories", href: "/apps" }, { label: app.name }]}
        title={app.name}
        description={snapshot.repo.description || app.description || "No repository description."}
        meta={
          <>
            <a
              href={app.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="mono">{app.repoFullName}</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <MetaItem icon={<Star className="h-3.5 w-3.5" />}>{snapshot.repo.stargazers_count.toLocaleString()} stars</MetaItem>
            {snapshot.repo.language && (
              <MetaItem icon={<Code2 className="h-3.5 w-3.5" />}>{snapshot.repo.language}</MetaItem>
            )}
            <MetaItem icon={<GitBranch className="h-3.5 w-3.5" />}>{snapshot.repo.default_branch}</MetaItem>
          </>
        }
        actions={
          <>
            <AppActions appId={app.id} />
            <EditAppModal
              appId={app.id}
              initialIncludePrereleases={app.includePrereleases}
              initialNotificationsEnabled={app.notificationsEnabled}
              initialCheckInterval={app.checkIntervalMinutes}
            />
          </>
        }
      />

      <div className="mb-5">
        <MetricStrip
          items={[
            {
              label: "Latest release",
              value: app.latestSeenTag ?? latestRelease?.tagName ?? "—",
              tone: app.updateAvailable ? "warning" : undefined,
            },
            { label: "Check status", value: check.label, tone: check.tone === "danger" ? "danger" : check.tone === "success" ? "success" : undefined },
            { label: "Last checked", value: app.lastCheckedAt ? formatRelativeTime(app.lastCheckedAt) : "never" },
            { label: "Stored releases", value: app.releases.length },
          ]}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-panel px-4 py-3 text-xs text-text-muted">
        {app.updateAvailable ? (
          <StatusDot tone="warning" pulse>
            New release waiting to be acknowledged
          </StatusDot>
        ) : (
          <StatusDot tone={check.tone}>{check.label}</StatusDot>
        )}
        <StatusDot tone={app.notificationsEnabled ? "success" : "neutral"}>
          {app.notificationsEnabled ? "Notifications on" : "Notifications muted"}
        </StatusDot>
        <StatusDot tone="neutral">
          {app.includePrereleases ? "Pre-releases included" : "Stable releases only"}
        </StatusDot>
        <StatusDot tone="neutral">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Checking every {formatInterval(app.checkIntervalMinutes)}
        </StatusDot>
        {app.checkError && app.checkStatus === "failed" && (
          <span className="inline-flex items-center gap-1.5 text-status-danger">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {app.checkError}
          </span>
        )}
      </div>

      <AppDetailTabs
        owner={app.repoOwner}
        repo={app.repoName}
        activeTab={activeTab}
        tabBaseUrl={`/apps/${app.id}`}
        snapshot={snapshot}
        releases={displayReleases}
        latestRelease={latestRelease}
        previousTag={previousTag}
        updateAvailable={app.updateAvailable}
        storedReleaseCount={app.releases.length}
        appId={app.id}
        mode="watched"
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Quick actions" description="Changes take effect on the next check.">
          <div className="flex flex-wrap gap-2">
            <DisableNotificationsButton appId={app.id} />
            <RemoveAppButton appId={app.id} />
          </div>
        </Panel>
        <Panel title="Elsewhere" description="Same repository, other views.">
          <div className="flex flex-col gap-2 text-sm">
            <Link
              href={`/apps/${app.id}/releases`}
              className="inline-flex items-center gap-2 text-text-muted transition-colors hover:text-accent"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" /> Full release history
            </Link>
            <Link
              href={`/apps/repo/${encodeURIComponent(app.repoOwner)}/${encodeURIComponent(app.repoName)}`}
              className="inline-flex items-center gap-2 text-text-muted transition-colors hover:text-accent"
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> Public repo preview
            </Link>
            <span className="inline-flex items-center gap-2 text-text-faint">
              {app.notificationsEnabled ? (
                <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Snapshot cached {new Date(snapshot.cachedAt).toLocaleString()}
            </span>
          </div>
        </Panel>
      </div>
    </>
  );
}

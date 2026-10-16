import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  BellOff,
  CheckCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  GitFork,
  Star,
  Tag,
  Code2,
  RefreshCw,
  GitBranch,
  Calendar,
  Server,
  Hash,
  Settings2,
  ArrowUpRight,
} from "lucide-react";
import { AppActions, DisableNotificationsButton, RemoveAppButton } from "@/components/ActionButtons";
import { AppDetailTabs, type AppTab } from "@/components/AppDetailTabs";
import { ClearPendingAppName } from "@/components/ClearPendingAppName";
import { EditAppModal } from "@/components/EditAppModal";
import { HeroCard } from "@/components/HeroCard";
import { StatPill } from "@/components/StatPill";
import { prisma } from "@/lib/prisma";
import { getRepoSnapshot } from "@/lib/repo-snapshot";
import { getCurrentPageUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentPageUser().catch(() => null);
  const app = currentUser
    ? await prisma.watchedApp.findUnique({
        where: { id, userId: currentUser.id },
        select: { name: true },
      })
    : null;
  return { title: app ? app.name : "App" };
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes < 1440) {
    const hours = minutes / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? "" : "s"}`;
  }
  const days = minutes / 1440;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? "" : "s"}`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function checkStatusLabel(status: string): { label: string; tone: "success" | "failure" | "muted" } {
  // checkStatus reflects whether the last automated check call to GitHub succeeded.
  // It does NOT mean the app itself is healthy.
  switch (status) {
    case "failed":
      return { label: "Check failed", tone: "failure" };
    case "success":
      return { label: "Check ok", tone: "success" };
    case "no_releases":
      return { label: "No releases", tone: "muted" };
    default:
      return { label: "Not checked", tone: "muted" };
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
      releases: {
        orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }],
        take: 50,
      },
    },
  });
  if (!app) notFound();

  const activeTab: AppTab = (["readme", "files", "releases", "issues", "commits", "pulls", "branches", "actions"] as string[]).includes(tab || "")
    ? (tab as AppTab)
    : "readme";
  // Private repos resolve via the viewer's own token inside getRepoSnapshot.
  // If GitHub is unreachable (or access was revoked), degrade to the stored
  // DB releases instead of failing the whole page.
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
  const displayReleases = (
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
        }))
  ).map((release) => {
    const stored = storedReleasesByGitHubId.get(String(release.id));
    return {
      id: stored?.id || `github-${release.id}`,
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
    };
  });
  const latestRelease = displayReleases[0] || null;
  const previousTag = displayReleases[1]?.tagName || null;

  const check = checkStatusLabel(app.checkStatus);

  return (
    <>
      <ClearPendingAppName />

      <HeroCard
        compact
        icon={<Code2 className="h-5 w-5" />}
        kicker="Watched app"
        title={app.name}
        subtitle={
          snapshot.repo.description ||
          app.description ||
          "No repository description available."
        }
        badges={
          <>
            <Link
              href={app.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_50%,transparent)] px-2.5 py-1 text-[0.78rem] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent-border)] transition-colors"
            >
              <GitFork className="h-3 w-3" />
              <span className="app-mono">{app.repoFullName}</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            {app.updateAvailable && (
              <span
                className="status-pill status-pill--pending ml-1"
                style={{ background: "var(--theme-status-pending-bg)", color: "var(--color-status-warning)" }}
              >
                <span className="pulse-dot" />
                Update available
              </span>
            )}
            {app.notificationsEnabled ? (
              <span className="status-pill status-pill--success">
                <Bell className="h-3 w-3" />
                Notifications on
              </span>
            ) : (
              <span className="status-pill status-pill--neutral">
                <BellOff className="h-3 w-3" />
                Notifications off
              </span>
            )}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <AppActions appId={app.id} size="icon" />
            <EditAppModal
              appId={app.id}
              initialIncludePrereleases={app.includePrereleases}
              initialNotificationsEnabled={app.notificationsEnabled}
              initialCheckInterval={app.checkIntervalMinutes}
            />
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatPill
          icon={<Hash className="h-3 w-3" />}
          label="Latest"
          value={app.latestSeenTag || latestRelease?.tagName || "—"}
          tone={app.updateAvailable ? "pending" : "default"}
        />
        <StatPill
          icon={<Star className="h-3 w-3" />}
          label="Stars"
          value={snapshot.repo.stargazers_count.toLocaleString()}
        />
        <StatPill
          icon={<Clock className="h-3 w-3" />}
          label="Last checked"
          value={app.lastCheckedAt ? timeAgo(app.lastCheckedAt) : "Never"}
          tone={app.checkStatus === "failed" ? "failure" : "default"}
        />
        <StatPill
          icon={app.checkStatus === "failed" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
          label="Check"
          value={check.label}
          tone={check.tone}
        />
        <StatPill
          icon={<GitBranch className="h-3 w-3" />}
          label="Branch"
          value={snapshot.repo.default_branch}
        />
        <StatPill
          icon={<Code2 className="h-3 w-3" />}
          label="Language"
          value={snapshot.repo.language || "—"}
        />
      </div>

      <div className="mt-4">
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
      </div>

      <div className="mt-6 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <SideCard icon={<RefreshCw className="h-3.5 w-3.5" />} label="Check interval">
          {formatInterval(app.checkIntervalMinutes)}
        </SideCard>
        <SideCard icon={<Settings2 className="h-3.5 w-3.5" />} label="Pre-releases">
          {app.includePrereleases ? "Included" : "Stable only"}
        </SideCard>
        <SideCard icon={<Calendar className="h-3.5 w-3.5" />} label="Snapshot cached">
          {new Date(snapshot.cachedAt).toLocaleString()}
        </SideCard>
        <SideCard icon={<Server className="h-3.5 w-3.5" />} label="Quick actions">
          <div className="flex flex-wrap gap-1.5">
            <DisableNotificationsButton appId={app.id} size="xs" />
            <RemoveAppButton appId={app.id} size="xs" />
          </div>
        </SideCard>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[0.78rem] text-[var(--color-text-faint)]">
        <Link
          href={`/apps/repo/${encodeURIComponent(app.repoOwner)}/${encodeURIComponent(app.repoName)}`}
          className="inline-flex items-center gap-1 hover:text-[var(--color-text-muted)] transition-colors"
        >
          View public repo preview <ArrowUpRight className="h-3 w-3" />
        </Link>
        <span>·</span>
        <Link
          href={`/apps/${app.id}/releases`}
          className="inline-flex items-center gap-1 hover:text-[var(--color-text-muted)] transition-colors"
        >
          <Tag className="h-3 w-3" /> All releases
        </Link>
      </div>
    </>
  );
}

function SideCard({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="app-stat">
      <div className="app-stat-label">
        {icon}
        {label}
      </div>
      <div className="app-stat-value">{children}</div>
    </div>
  );
}

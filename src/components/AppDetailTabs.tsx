import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, FileCode2, FolderTree, Tag, CircleDot, GitCommit, GitPullRequest, GitBranch, Workflow } from "lucide-react";
import { FileBrowser } from "@/components/FileBrowser";
import { IssuesTab } from "@/components/IssuesTab";
import { LatestReleaseHero } from "@/components/LatestReleaseHero";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ReleaseHistory } from "@/components/ReleaseHistory";
import { CommitsTab } from "@/components/CommitsTab";
import { PullRequestsTab } from "@/components/PullRequestsTab";
import { BranchesTab } from "@/components/BranchesTab";
import { ActionsTab } from "@/components/ActionsTab";

export type DisplayRelease = {
  id: string;
  tagName: string;
  name: string | null;
  body: string | null;
  htmlUrl: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: Date | null;
  detectedAt: Date;
  ignored: boolean;
  notificationSent: boolean;
};

type SnapshotFile = {
  name: string;
  path: string;
  type: string;
  size: number;
  html_url: string;
};

type SnapshotRepo = {
  html_url: string;
  full_name: string;
  default_branch: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  homepage: string | null;
};

type SnapshotRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  published_at: string | null;
};

export type RepoSnapshotData = {
  repo: SnapshotRepo;
  releases: SnapshotRelease[];
  files: SnapshotFile[];
  readme: string | null;
  cachedAt: string;
};

export type AppTab = "readme" | "files" | "releases" | "issues" | "commits" | "pulls" | "branches" | "actions";

const TAB_DEFS: Array<{ key: AppTab; label: string; icon: ReactNode; showFor: Array<"watched" | "preview"> }> = [
  { key: "readme", label: "README", icon: <FileCode2 className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "files", label: "Files", icon: <FolderTree className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "releases", label: "Releases", icon: <Tag className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "pulls", label: "Pull Requests", icon: <GitPullRequest className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "issues", label: "Issues", icon: <CircleDot className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "branches", label: "Branches", icon: <GitBranch className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "actions", label: "Actions", icon: <Workflow className="h-4 w-4" />, showFor: ["watched", "preview"] },
  { key: "commits", label: "Commits", icon: <GitCommit className="h-4 w-4" />, showFor: ["watched", "preview"] },
];

export function AppDetailTabs({
  owner,
  repo,
  activeTab,
  tabBaseUrl,
  snapshot,
  releases,
  latestRelease,
  previousTag,
  updateAvailable,
  storedReleaseCount,
  appId,
  mode = "watched",
}: {
  owner: string;
  repo: string;
  activeTab: AppTab;
  tabBaseUrl: string;
  snapshot: RepoSnapshotData;
  releases: DisplayRelease[];
  latestRelease: DisplayRelease | null;
  previousTag?: string | null;
  updateAvailable?: boolean;
  storedReleaseCount?: number;
  appId?: string;
  mode?: "watched" | "preview";
}) {
  const linkBaseUrl = `${snapshot.repo.html_url}/blob/${snapshot.repo.default_branch}/`;
  const imageBaseUrl = `https://raw.githubusercontent.com/${snapshot.repo.full_name}/${snapshot.repo.default_branch}/`;
  const commitsEndpoint = appId ? `/api/apps/${appId}/commits` : `/api/github/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;

  const visibleTabs = TAB_DEFS.filter((t) => t.showFor.includes(mode));
  const safeActive: AppTab = (visibleTabs.some((t) => t.key === activeTab) ? activeTab : visibleTabs[0].key) as AppTab;

  return (
    <>
      <div className="app-tabs" role="tablist">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={`${tabBaseUrl}?tab=${t.key}`}
            role="tab"
            aria-selected={safeActive === t.key}
            data-active={safeActive === t.key}
            className="app-tab"
            scroll={false}
          >
            {t.icon}
            {t.label}
          </Link>
        ))}
      </div>

      {safeActive === "readme" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] mt-5">
          <div className="app-shell-card overflow-hidden min-w-0">
            <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[var(--theme-divider)] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">README</h2>
                <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">
                  Cached from GitHub and refreshed on new release detection.
                </p>
              </div>
            </div>
            <div className="px-4 py-4 sm:px-6 sm:py-5">
              <MarkdownContent
                body={snapshot.readme}
                emptyMessage="This repository does not expose a README through the GitHub API."
                linkBaseUrl={linkBaseUrl}
                imageBaseUrl={imageBaseUrl}
              />
            </div>
          </div>
          <aside className="space-y-3">
            <div className="app-shell-card p-5">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-faint)]">
                Project Links
              </h3>
              <div className="mt-3 space-y-3">
                <a
                  href={snapshot.repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-3 py-2.5 text-sm text-[var(--theme-text)] hover:border-[var(--theme-accent-border)] hover:text-[var(--theme-accent)] transition-colors"
                >
                  <span className="truncate app-mono text-[0.82rem]">{snapshot.repo.full_name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--theme-text-faint)]" />
                </a>
                {snapshot.repo.homepage && (
                  <a
                    href={snapshot.repo.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] px-3 py-2.5 text-sm text-[var(--theme-text)] hover:border-[var(--theme-accent-border)] hover:text-[var(--theme-accent)] transition-colors"
                  >
                    <span className="truncate">{snapshot.repo.homepage}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[var(--theme-text-faint)]" />
                  </a>
                )}
              </div>
            </div>

            <div className="app-shell-card p-5">
              <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-faint)]">
                Snapshot
              </h3>
              <div className="mt-3 space-y-2.5">
                <SnapshotRow label="Files cached" value={snapshot.files.length} />
                <SnapshotRow label="Releases cached" value={snapshot.releases.length} />
                {storedReleaseCount !== undefined && (
                  <SnapshotRow label="Stored releases" value={storedReleaseCount} />
                )}
                <SnapshotRow label="Fetched" value={new Date(snapshot.cachedAt).toLocaleString()} />
              </div>
            </div>
          </aside>
        </section>
      )}

      {safeActive === "files" && (
        <section className="app-shell-card overflow-hidden mt-5">
          <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[var(--theme-divider)]">
            <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">Repository Files</h2>
            <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">
              Browse the repository on <span className="app-mono">{snapshot.repo.default_branch}</span>.
            </p>
          </div>
          <FileBrowser
            owner={owner}
            repo={repo}
            defaultBranch={snapshot.repo.default_branch}
            initialFiles={snapshot.files}
          />
        </section>
      )}

      {safeActive === "releases" && (
        <div className="mt-5 space-y-6">
          <LatestReleaseHero
            latestRelease={
              latestRelease
                ? {
                    id: latestRelease.id,
                    tagName: latestRelease.tagName,
                    name: latestRelease.name,
                    body: latestRelease.body,
                    htmlUrl: latestRelease.htmlUrl,
                    prerelease: latestRelease.prerelease,
                    publishedAt: latestRelease.publishedAt,
                  }
                : null
            }
            previousTag={previousTag ?? null}
            updateAvailable={updateAvailable ?? false}
          />

          <section>
            <div className="section-heading">
              <h2>Release History</h2>
              <span className="section-heading-meta">{releases.length} release{releases.length === 1 ? "" : "s"}</span>
            </div>
            <ReleaseHistory releases={releases} />
          </section>
        </div>
      )}

      {safeActive === "issues" && (
        <section className="app-shell-card p-4 sm:p-5 mt-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">Issues</h2>
            <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">Browse open and closed issues from GitHub.</p>
          </div>
          <IssuesTab owner={owner} repo={repo} appId={appId} />
        </section>
      )}

      {safeActive === "commits" && (
        <section className="mt-5">
          <div className="section-heading">
            <h2>Recent Commits</h2>
            <span className="section-heading-meta">
              on <span className="app-mono">{snapshot.repo.default_branch}</span>
            </span>
          </div>
          <CommitsTab endpoint={commitsEndpoint} defaultBranch={snapshot.repo.default_branch} />
        </section>
      )}

      {safeActive === "pulls" && (
        <section className="app-shell-card p-4 sm:p-5 mt-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">Pull Requests</h2>
            <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">View and manage pull requests on GitHub.</p>
          </div>
          <PullRequestsTab owner={owner} repo={repo} />
        </section>
      )}

      {safeActive === "branches" && (
        <section className="app-shell-card p-4 sm:p-5 mt-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">Branches</h2>
            <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">All branches in this repository.</p>
          </div>
          <BranchesTab owner={owner} repo={repo} defaultBranch={snapshot.repo.default_branch} />
        </section>
      )}

      {safeActive === "actions" && (
        <section className="app-shell-card p-4 sm:p-5 mt-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold tracking-tight text-[var(--theme-text)]">GitHub Actions</h2>
            <p className="text-[0.78rem] text-[var(--theme-text-muted)] mt-0.5">Recent workflow runs and their status.</p>
          </div>
          <ActionsTab owner={owner} repo={repo} />
        </section>
      )}
    </>
  );
}

function SnapshotRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--theme-text-muted)]">{label}</span>
      <span className="text-[var(--theme-text)] font-medium text-right truncate">{value}</span>
    </div>
  );
}

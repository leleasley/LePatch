import Link from "next/link";
import type { ReactNode } from "react";
import {
  CircleDot,
  ExternalLink,
  FileCode2,
  FolderTree,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Tag,
  Workflow,
} from "lucide-react";
import { FileBrowser } from "@/components/FileBrowser";
import { IssuesTab } from "@/components/IssuesTab";
import { LatestReleaseHero } from "@/components/LatestReleaseHero";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ReleaseHistory } from "@/components/ReleaseHistory";
import { CommitsTab } from "@/components/CommitsTab";
import { PullRequestsTab } from "@/components/PullRequestsTab";
import { BranchesTab } from "@/components/BranchesTab";
import { ActionsTab } from "@/components/ActionsTab";
import { Panel } from "@/components/ui/List";

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

const TAB_DEFS: Array<{ key: AppTab; label: string; icon: ReactNode }> = [
  { key: "readme", label: "Overview", icon: <FileCode2 className="h-3.5 w-3.5" /> },
  { key: "releases", label: "Releases", icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "commits", label: "Commits", icon: <GitCommit className="h-3.5 w-3.5" /> },
  { key: "pulls", label: "Pull requests", icon: <GitPullRequest className="h-3.5 w-3.5" /> },
  { key: "issues", label: "Issues", icon: <CircleDot className="h-3.5 w-3.5" /> },
  { key: "branches", label: "Branches", icon: <GitBranch className="h-3.5 w-3.5" /> },
  { key: "actions", label: "Actions", icon: <Workflow className="h-3.5 w-3.5" /> },
  { key: "files", label: "Files", icon: <FolderTree className="h-3.5 w-3.5" /> },
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
  const commitsEndpoint = appId
    ? `/api/apps/${appId}/commits`
    : `/api/github/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;

  const safeActive = TAB_DEFS.some((t) => t.key === activeTab) ? activeTab : "readme";

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Repository sections"
        className="chip-row border-b border-border pb-0"
        style={{ borderBottom: "1px solid var(--ui-border)" }}
      >
        {TAB_DEFS.map((tab) => {
          const active = safeActive === tab.key;
          return (
            <Link
              key={tab.key}
              href={`${tabBaseUrl}?tab=${tab.key}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-accent font-medium text-text"
                  : "border-transparent text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              <span aria-hidden="true" className={active ? "text-accent" : "text-text-faint"}>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {safeActive === "readme" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Panel
            title="README"
            description="Cached from GitHub, refreshed when a new release is detected."
            flush
            bodyClassName="px-4 py-4 sm:px-5 sm:py-5"
          >
            <MarkdownContent
              body={snapshot.readme}
              emptyMessage="This repository does not expose a README through the GitHub API."
              linkBaseUrl={linkBaseUrl}
              imageBaseUrl={imageBaseUrl}
            />
          </Panel>

          <aside className="flex flex-col gap-4">
            <Panel title="Links">
              <div className="flex flex-col gap-2">
                <a
                  href={snapshot.repo.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm text-text transition-colors hover:border-accent/50"
                >
                  <span className="mono truncate text-xs">{snapshot.repo.full_name}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden="true" />
                </a>
                {snapshot.repo.homepage && (
                  <a
                    href={snapshot.repo.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm text-text transition-colors hover:border-accent/50"
                  >
                    <span className="truncate text-xs">{snapshot.repo.homepage}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden="true" />
                  </a>
                )}
              </div>
            </Panel>

            <Panel title="Cached snapshot">
              <dl className="flex flex-col gap-2 text-sm">
                {[
                  ["Files", snapshot.files.length],
                  ["Releases", snapshot.releases.length],
                  ...(storedReleaseCount !== undefined ? [["Stored releases", storedReleaseCount] as [string, number]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="font-medium tabular-nums text-text">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-text-muted">Fetched</dt>
                  <dd className="text-text">{new Date(snapshot.cachedAt).toLocaleString()}</dd>
                </div>
              </dl>
            </Panel>
          </aside>
        </div>
      )}

      {safeActive === "files" && (
        <Panel
          title="Files"
          description={
            <>
              Browsing <span className="mono">{snapshot.repo.default_branch}</span> at the latest cached snapshot.
            </>
          }
          flush
        >
          <FileBrowser
            owner={owner}
            repo={repo}
            defaultBranch={snapshot.repo.default_branch}
            initialFiles={snapshot.files}
          />
        </Panel>
      )}

      {safeActive === "releases" && (
        <div className="flex flex-col gap-5">
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
          <ReleaseHistory releases={releases} appId={appId} />
        </div>
      )}

      {safeActive === "issues" && (
        <Panel title="Issues" description="Open and closed issues from GitHub." flush bodyClassName="p-4 sm:p-5">
          <IssuesTab owner={owner} repo={repo} appId={appId} />
        </Panel>
      )}

      {safeActive === "commits" && (
        <Panel
          title="Commits"
          description={
            <>
              Recent commits on <span className="mono">{snapshot.repo.default_branch}</span>.
            </>
          }
          flush
        >
          <CommitsTab endpoint={commitsEndpoint} defaultBranch={snapshot.repo.default_branch} />
        </Panel>
      )}

      {safeActive === "pulls" && (
        <Panel title="Pull requests" description="Open and recently closed pull requests." flush bodyClassName="p-4 sm:p-5">
          <PullRequestsTab owner={owner} repo={repo} />
        </Panel>
      )}

      {safeActive === "branches" && (
        <Panel title="Branches" description="Every branch in this repository." flush bodyClassName="p-4 sm:p-5">
          <BranchesTab owner={owner} repo={repo} defaultBranch={snapshot.repo.default_branch} />
        </Panel>
      )}

      {safeActive === "actions" && (
        <Panel title="Workflow runs" description="Recent GitHub Actions runs and their status." flush bodyClassName="p-4 sm:p-5">
          <ActionsTab owner={owner} repo={repo} />
        </Panel>
      )}
    </div>
  );
}
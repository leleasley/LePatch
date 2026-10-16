import { getIntegrationSettingValue } from "@/lib/integration-secrets";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export type GitHubRepo = {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
  topics?: string[];
};

export type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  published_at: string | null;
};

export type GitHubRepoContent = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  html_url: string;
  download_url: string | null;
};

const cache = new Map<string, { expiresAt: number; value: unknown }>();

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getGithubToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  try {
    const token = await getIntegrationSettingValue("github", "token");
    cachedToken = token ? { token, expiresAt: Date.now() + 5 * 60 * 1000 } : null;
    return token;
  } catch (err) {
    cachedToken = null;
    logger.warn("Failed to fetch GitHub integration token", { error: err });
    return null;
  }
}

export const GITHUB_NOT_FOUND_MESSAGE = "Repository or release not found";
export const GITHUB_TOKEN_EXPIRED_MESSAGE =
  "GitHub token expired or revoked — reconnect GitHub under Profile > Security.";

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === GITHUB_NOT_FOUND_MESSAGE;
}

export function isTokenExpiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === GITHUB_TOKEN_EXPIRED_MESSAGE ||
      /status 401/.test(error.message))
  );
}

/** Decrypted OAuth token of the user's connected GitHub account, if any. */
export async function getUserGithubToken(userId: string): Promise<string | null> {
  try {
    const link = await prisma.gitHubLink.findUnique({ where: { userId } });
    if (!link) return null;
    return decrypt(link.accessToken);
  } catch (err) {
    logger.warn("Failed to resolve user GitHub token", { error: err });
    return null;
  }
}

/**
 * GitHub's search API answers 422 (not 404) for repos the token cannot see,
 * so both statuses mean "possibly private — retry with the viewer's token".
 */
export function isPossiblyPrivateError(error: unknown): boolean {
  return (
    isNotFoundError(error) ||
    (error instanceof Error && /status 422/.test(error.message))
  );
}

/**
 * Run a loader with the shared integration token first; on 404/422 retry with
 * the viewer's own OAuth token so private/sponsor-gated repos they can see
 * also work. Failures (including token expiry) are never swallowed here —
 * callers decide what to show.
 */
export async function fetchRepoWithAccess<T>(
  userId: string | null | undefined,
  loader: (accessToken?: string) => Promise<T>,
  resolveToken: (userId: string) => Promise<string | null> = getUserGithubToken
): Promise<T> {
  try {
    return await loader(undefined);
  } catch (error) {
    if (!isPossiblyPrivateError(error) || !userId) throw error;
    const token = await resolveToken(userId);
    if (!token) throw error;
    return await loader(token);
  }
}

export async function githubFetch<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const token = accessToken ?? (await getGithubToken());
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "LePatch",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init?.headers
  };
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
    next: { revalidate: 0 }
  });

  if (response.status === 404) throw new Error(GITHUB_NOT_FOUND_MESSAGE);
  if (response.status === 401) throw new Error(GITHUB_TOKEN_EXPIRED_MESSAGE);
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit exceeded");
  }
  if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}`);

  return (await response.json()) as T;
}

async function githubTextFetch(path: string, init?: RequestInit, accessToken?: string): Promise<string | null> {
  const token = accessToken ?? (await getGithubToken());
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "LePatch",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    },
    next: { revalidate: 0 }
  });

  if (response.status === 404) return null;
  if (response.status === 401) throw new Error(GITHUB_TOKEN_EXPIRED_MESSAGE);
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit exceeded");
  }
  if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}`);

  return response.text();
}

export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await loader();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function searchRepos(query: string, page = 1) {
  const cacheKey = `search:${query}:${page}`;
  return cached(cacheKey, 5 * 60 * 1000, async () => {
    const data = await githubFetch<{ items: GitHubRepo[]; total_count: number }>(
      `/search/repositories?q=${encodeURIComponent(query)}+in:name,description&sort=stars&order=desc&per_page=10&page=${page}`
    );

    return { items: data.items, totalCount: data.total_count };
  });
}

export async function getRepo(owner: string, repo: string, accessToken?: string) {
  return githubFetch<GitHubRepo>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, undefined, accessToken);
}

export async function getReleases(owner: string, repo: string, accessToken?: string) {
  return githubFetch<GitHubRelease[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=30`,
    undefined,
    accessToken
  );
}

export async function getRepoContents(owner: string, repo: string, accessToken?: string) {
  const data = await githubFetch<GitHubRepoContent[] | GitHubRepoContent>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
    undefined,
    accessToken
  );
  return Array.isArray(data) ? data : [data];
}

export async function getRepoContentsAtPath(owner: string, repo: string, path: string, accessToken?: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubFetch<GitHubRepoContent[] | GitHubRepoContent>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
    undefined,
    accessToken
  );
  return Array.isArray(data) ? data : [data];
}

export async function getLatestRelease(owner: string, repo: string, includePrereleases: boolean, accessToken?: string) {
  const releases = await getReleases(owner, repo, accessToken);
  return releases.find((release) => !release.draft && (includePrereleases || !release.prerelease)) || null;
}

export async function getLatestTag(owner: string, repo: string): Promise<string | null> {
  try {
    const data = await githubFetch<{ tag_name: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`
    );
    return data.tag_name.replace(/^v/, "");
  } catch {
    return null;
  }
}

export async function getLatestReleaseWithAssets(owner: string, repo: string) {
  return githubFetch<{
    tag_name: string;
    assets: Array<{ name: string; browser_download_url: string; content_type: string }>;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`);
}

export async function getRepoReadme(owner: string, repo: string, accessToken?: string) {
  if (accessToken) {
    return githubTextFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      undefined,
      accessToken
    );
  }
  return cached(`readme:${owner}/${repo}`, 60 * 60 * 1000, async () =>
    githubTextFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`)
  );
}

export type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string; avatar_url: string; html_url: string } | null;
  labels: Array<{ name: string; color: string }>;
  comments: number;
  assignees: Array<{ login: string; avatar_url: string }>;
};

export async function getRepoIssues(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  page = 1,
  perPage = 20,
  accessToken?: string
) {
  const loader = async () => {
    const data = await githubFetch<{ items: GitHubIssue[]; total_count: number }>(
      `/search/issues?q=repo:${encodeURIComponent(owner)}/${encodeURIComponent(repo)}+type:issue+state:${state}&sort=created&order=desc&per_page=${perPage}&page=${page}`,
      undefined,
      accessToken
    );
    return { items: data.items, totalCount: data.total_count };
  };
  if (accessToken) return loader();
  const cacheKey = `issues:${owner}/${repo}:${state}:${page}`;
  return cached(cacheKey, 2 * 60 * 1000, loader);
}

export type GitHubIssueComment = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string; html_url: string } | null;
};

export async function getIssueComments(owner: string, repo: string, issueNumber: number, accessToken?: string) {
  const loader = async () => {
    return githubFetch<GitHubIssueComment[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100`,
      undefined,
      accessToken
    );
  };
  if (accessToken) return loader();
  const cacheKey = `issue-comments:${owner}/${repo}:${issueNumber}`;
  return cached(cacheKey, 2 * 60 * 1000, loader);
}

export type GitHubCommitAuthor = {
  name: string;
  email: string;
  date: string;
} | null;

export type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
    tree: { sha: string; url: string };
    comment_count: number;
  };
  author: { login: string; avatar_url: string; html_url: string } | null;
  committer: { login: string; avatar_url: string; html_url: string } | null;
  parents: Array<{ sha: string; html_url: string }>;
};

export type GitHubCommitStatus = {
  context: string;
  state: "success" | "failure" | "pending" | "error";
  description: string | null;
  target_url: string | null;
  updated_at: string;
  avatar_url: string | null;
};

export type GitHubCombinedStatus = {
  state: "success" | "failure" | "pending";
  statuses: GitHubCommitStatus[];
  total_count: number;
};

export type GitHubCheckRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | "stale"
  | null;

export type GitHubCheckRun = {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed" | "waiting" | "requested";
  conclusion: GitHubCheckRunConclusion;
  html_url: string;
  details_url: string | null;
  started_at: string;
  completed_at: string | null;
};

export type GitHubCheckRunsResponse = {
  total_count: number;
  check_runs: GitHubCheckRun[];
};

export type CommitDisplayStatus =
  | "success"
  | "failure"
  | "in_progress"
  | "pending"
  | "neutral";

export type CommitStatusSummary = {
  state: CommitDisplayStatus;
  total: number;
  failed: number;
  pending: number;
  checks: Array<{ name: string; state: CommitDisplayStatus; url: string | null }>;
};

export async function getRepoCommits(
  owner: string,
  repo: string,
  opts: { page?: number; perPage?: number; sha?: string; branch?: string } = {},
  accessToken?: string
): Promise<GitHubCommit[]> {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(100, Math.max(1, opts.perPage ?? 25));
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (opts.sha) params.set("sha", opts.sha);
  if (opts.branch && !opts.sha) params.set("sha", opts.branch);
  return githubFetch<GitHubCommit[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`,
    undefined,
    accessToken
  );
}

export async function getCombinedStatus(
  owner: string,
  repo: string,
  ref: string,
  accessToken?: string
): Promise<GitHubCombinedStatus> {
  return githubFetch<GitHubCombinedStatus>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/status`,
    undefined,
    accessToken
  );
}

export async function getCheckRunsForRef(
  owner: string,
  repo: string,
  ref: string,
  accessToken?: string
): Promise<GitHubCheckRunsResponse> {
  try {
    return await githubFetch<GitHubCheckRunsResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(ref)}/check-runs?per_page=20`,
      undefined,
      accessToken
    );
  } catch {
    return { total_count: 0, check_runs: [] };
  }
}

const FAILURE_CONCLUSIONS: ReadonlySet<Exclude<GitHubCheckRunConclusion, null>> = new Set([
  "failure",
  "timed_out",
  "action_required",
  "cancelled",
]);

export function summarizeCheckRuns(runs: GitHubCheckRun[]): CommitStatusSummary {
  if (!runs || runs.length === 0) {
    return { state: "neutral", total: 0, failed: 0, pending: 0, checks: [] };
  }
  let failed = 0;
  let pending = 0;
  const checks: CommitStatusSummary["checks"] = [];

  for (const run of runs) {
    let displayState: CommitDisplayStatus;
    if (run.status === "in_progress" || run.status === "queued" || run.status === "waiting" || run.status === "requested") {
      displayState = "in_progress";
      pending += 1;
    } else if (run.conclusion && FAILURE_CONCLUSIONS.has(run.conclusion)) {
      displayState = "failure";
      failed += 1;
    } else if (run.conclusion === "success") {
      displayState = "success";
    } else if (run.conclusion === "skipped" || run.conclusion === "neutral" || run.conclusion === "stale") {
      displayState = "neutral";
    } else {
      displayState = "pending";
      pending += 1;
    }
    checks.push({ name: run.name, state: displayState, url: run.details_url || run.html_url });
  }

  let state: CommitDisplayStatus = "success";
  if (failed > 0) state = "failure";
  else if (pending > 0) state = "in_progress";

  return { state, total: runs.length, failed, pending, checks };
}

export function summarizeCombinedStatus(status: GitHubCombinedStatus): CommitStatusSummary {
  if (status.total_count === 0 || status.statuses.length === 0) {
    return { state: "neutral", total: 0, failed: 0, pending: 0, checks: [] };
  }
  let failed = 0;
  let pending = 0;
  const checks: CommitStatusSummary["checks"] = [];
  for (const s of status.statuses) {
    let displayState: CommitDisplayStatus;
    if (s.state === "success") displayState = "success";
    else if (s.state === "failure" || s.state === "error") {
      displayState = "failure";
      failed += 1;
    } else {
      displayState = "pending";
      pending += 1;
    }
    checks.push({ name: s.context, state: displayState, url: s.target_url });
  }
  let state: CommitDisplayStatus = "success";
  if (failed > 0) state = "failure";
  else if (pending > 0) state = "in_progress";
  else if (status.state === "pending") state = "pending";
  return { state, total: status.total_count, failed, pending, checks };
}

// ── Pull Requests ───────────────────────────────────────────────────────────

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user: { login: string; avatar_url: string; html_url: string } | null;
  labels: Array<{ name: string; color: string }>;
  head: { ref: string; sha: string; label: string };
  base: { ref: string; sha: string; label: string };
  additions: number;
  deletions: number;
  changed_files: number;
  draft: boolean;
  reviewers: Array<{ login: string; avatar_url: string }>;
  requested_reviewers: Array<{ login: string; avatar_url: string }>;
};

export async function getPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
  page = 1,
  perPage = 20,
  accessToken?: string
) {
  const loader = async () => {
    const data = await githubFetch<{ items: GitHubPullRequest[]; total_count: number }>(
      `/search/issues?q=repo:${encodeURIComponent(owner)}/${encodeURIComponent(repo)}+type:pr+state:${state}&sort=created&order=desc&per_page=${perPage}&page=${page}`,
      undefined,
      accessToken
    );
    return { items: data.items as unknown as GitHubPullRequest[], totalCount: data.total_count };
  };
  if (accessToken) return loader();
  const cacheKey = `pulls:${owner}/${repo}:${state}:${page}`;
  return cached(cacheKey, 2 * 60 * 1000, loader);
}

export async function getPullRequest(owner: string, repo: string, pullNumber: number, accessToken?: string) {
  return githubFetch<GitHubPullRequest>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pullNumber}`,
    undefined,
    accessToken
  );
}

// ── Branches ────────────────────────────────────────────────────────────────

export type GitHubBranch = {
  name: string;
  commit: { sha: string; url: string };
  protected: boolean;
};

export async function getBranches(owner: string, repo: string, accessToken?: string) {
  const loader = async () => {
    return githubFetch<GitHubBranch[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`,
      undefined,
      accessToken
    );
  };
  if (accessToken) return loader();
  const cacheKey = `branches:${owner}/${repo}`;
  return cached(cacheKey, 5 * 60 * 1000, loader);
}

// ── GitHub Actions ──────────────────────────────────────────────────────────

export type GitHubWorkflowRun = {
  id: number;
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | "timed_out" | "action_required" | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  head_branch: string;
  head_sha: string;
  event: string;
  actor: { login: string; avatar_url: string } | null;
  workflow_id: number;
  run_number: number;
};

export type GitHubWorkflow = {
  id: number;
  name: string;
  path: string;
  state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually";
  created_at: string;
  updated_at: string;
};

export async function getWorkflowRuns(
  owner: string,
  repo: string,
  page = 1,
  perPage = 20,
  accessToken?: string
) {
  const loader = async () => {
    const data = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}&page=${page}&status=completed`,
      undefined,
      accessToken
    );
    const inProgress = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=10&status=in_progress`,
      undefined,
      accessToken
    ).catch(() => ({ workflow_runs: [] as GitHubWorkflowRun[] }));
    const queued = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=10&status=queued`,
      undefined,
      accessToken
    ).catch(() => ({ workflow_runs: [] as GitHubWorkflowRun[] }));

    const allRuns = [...inProgress.workflow_runs, ...queued.workflow_runs, ...data.workflow_runs];
    const uniqueRuns = Array.from(new Map(allRuns.map((r) => [r.id, r])).values());
    return { runs: uniqueRuns, total: uniqueRuns.length };
  };
  if (accessToken) return loader();
  const cacheKey = `actions:${owner}/${repo}:${page}`;
  return cached(cacheKey, 2 * 60 * 1000, loader);
}

export async function getWorkflows(owner: string, repo: string) {
  const cacheKey = `workflows:${owner}/${repo}`;
  return cached(cacheKey, 5 * 60 * 1000, async () => {
    const data = await githubFetch<{ workflows: GitHubWorkflow[] }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`
    );
    return data.workflows;
  });
}

export type SponsoredRepo = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  sponsorLogin: string;
};

/**
 * Top repositories of the accounts the authenticated user sponsors via
 * GitHub Sponsors. There is no REST endpoint for this — it uses the GraphQL
 * `viewer.sponsorshipsAsSponsor` connection. Sponsorships target users/orgs
 * (the `Sponsorable` union has no Repository member), so we return each
 * sponsored maintainer's most-starred repos. Requires the `read:user`
 * scope on the OAuth token.
 */
export async function getSponsoredRepos(accessToken: string): Promise<SponsoredRepo[]> {
  const repos: SponsoredRepo[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  const repoSelection = `repositories(first: 10, orderBy: {field: STARGAZERS, direction: DESC}, ownerAffiliations: OWNER) {
    nodes {
      nameWithOwner
      description
      stargazerCount
      primaryLanguage { name }
      url
    }
  }`;

  for (let page = 0; page < 5; page++) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "LePatch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query ($after: String) {
          viewer {
            sponsorshipsAsSponsor(first: 100, after: $after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                sponsorable {
                  __typename
                  ... on User {
                    login
                    ${repoSelection}
                  }
                  ... on Organization {
                    login
                    ${repoSelection}
                  }
                }
              }
            }
          }
        }`,
        variables: { after },
      }),
    });

    if (!response.ok) throw new Error(`GitHub GraphQL request failed with status ${response.status}`);
    const data = (await response.json()) as {
      errors?: Array<{ message: string }>;
      data?: {
        viewer: {
          sponsorshipsAsSponsor: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: Array<{
              sponsorable: {
                login?: string;
                repositories?: {
                  nodes: Array<{
                    nameWithOwner?: string;
                    description?: string | null;
                    stargazerCount?: number;
                    primaryLanguage?: { name: string } | null;
                    url?: string;
                  } | null> | null;
                };
              } | null;
            }>;
          };
        };
      };
    };
    if (data.errors?.length) throw new Error(data.errors[0].message);

    const connection = data.data?.viewer.sponsorshipsAsSponsor;
    if (!connection) break;
    for (const node of connection.nodes) {
      const login = node.sponsorable?.login;
      const nodes = node.sponsorable?.repositories?.nodes;
      if (!login || !nodes) continue;
      for (const repo of nodes) {
        if (!repo?.nameWithOwner || seen.has(repo.nameWithOwner)) continue;
        seen.add(repo.nameWithOwner);
        repos.push({
          full_name: repo.nameWithOwner,
          description: repo.description ?? null,
          stargazers_count: repo.stargazerCount ?? 0,
          language: repo.primaryLanguage?.name ?? null,
          html_url: repo.url ?? `https://github.com/${repo.nameWithOwner}`,
          sponsorLogin: login,
        });
      }
    }
    if (!connection.pageInfo.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  return repos;
}

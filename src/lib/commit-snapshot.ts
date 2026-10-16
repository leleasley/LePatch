import { ensureRedisConnected } from "@/lib/redis";
import { logger } from "@/lib/logger";
import {
  getCheckRunsForRef,
  getCombinedStatus,
  getRepoCommits,
  isPossiblyPrivateError,
  isTokenExpiredError,
  summarizeCheckRuns,
  summarizeCombinedStatus,
  type CommitStatusSummary,
  type GitHubCommit,
} from "@/lib/github";

const TTL_SECONDS = 10 * 60;
const EMPTY_TTL_SECONDS = 90;
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 50;

export type CommitWithStatus = {
  sha: string;
  shortSha: string;
  htmlUrl: string;
  message: string;
  messageHeadline: string;
  author: {
    name: string;
    login: string | null;
    avatarUrl: string | null;
    htmlUrl: string | null;
    date: string | null;
  };
  committer: {
    name: string;
    login: string | null;
    avatarUrl: string | null;
    htmlUrl: string | null;
    date: string | null;
  };
  parents: Array<{ sha: string; htmlUrl: string }>;
  status: CommitStatusSummary;
};

export type CommitSnapshot = {
  commits: CommitWithStatus[];
  totalCount: number;
  page: number;
  perPage: number;
  fetchedAt: string;
  hasMore: boolean;
  rateLimited?: boolean;
  error?: string;
};

function snapshotKey(owner: string, repo: string, page: number, cacheScope?: string) {
  const base = `commit-snapshot:v1:${owner.toLowerCase()}/${repo.toLowerCase()}:${page}`;
  // Private repo data must never sit under the shared key.
  return cacheScope ? `${base}:u:${cacheScope}` : base;
}

async function readSnapshot(
  owner: string,
  repo: string,
  page: number,
  cacheScope?: string
): Promise<CommitSnapshot | null> {
  try {
    const redis = await ensureRedisConnected();
    const cached = await redis.get(snapshotKey(owner, repo, page, cacheScope));
    if (!cached) return null;
    return JSON.parse(cached) as CommitSnapshot;
  } catch (error) {
    logger.warn("Commit snapshot cache read failed", {
      repoFullName: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function writeSnapshot(
  owner: string,
  repo: string,
  page: number,
  snapshot: CommitSnapshot,
  ttlSeconds: number,
  cacheScope?: string
) {
  try {
    const redis = await ensureRedisConnected();
    await redis.set(snapshotKey(owner, repo, page, cacheScope), JSON.stringify(snapshot), "EX", ttlSeconds);
  } catch (error) {
    logger.warn("Commit snapshot cache write failed", {
      repoFullName: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function splitHeadline(message: string): string {
  const idx = message.indexOf("\n");
  return (idx === -1 ? message : message.slice(0, idx)).trim();
}

function toCommitWithStatus(
  commit: GitHubCommit,
  status: CommitStatusSummary
): CommitWithStatus {
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    htmlUrl: commit.html_url,
    message: commit.commit.message,
    messageHeadline: splitHeadline(commit.commit.message),
    author: {
      name: commit.commit.author?.name || commit.author?.login || "Unknown",
      login: commit.author?.login ?? null,
      avatarUrl: commit.author?.avatar_url ?? null,
      htmlUrl: commit.author?.html_url ?? null,
      date: commit.commit.author?.date ?? null,
    },
    committer: {
      name: commit.commit.committer?.name || commit.committer?.login || "Unknown",
      login: commit.committer?.login ?? null,
      avatarUrl: commit.committer?.avatar_url ?? null,
      htmlUrl: commit.committer?.html_url ?? null,
      date: commit.commit.committer?.date ?? null,
    },
    parents: (commit.parents || []).map((p) => ({ sha: p.sha, htmlUrl: p.html_url })),
    status,
  };
}

export async function getCommitSnapshot(
  owner: string,
  repo: string,
  page = 1,
  perPage = DEFAULT_PER_PAGE,
  accessToken?: string,
  cacheScope?: string
): Promise<CommitSnapshot> {
  const normalizedPerPage = Math.min(MAX_PER_PAGE, Math.max(5, perPage));
  const cached = await readSnapshot(owner, repo, page, cacheScope);
  if (cached) return cached;

  return buildAndCacheCommitSnapshot(owner, repo, page, normalizedPerPage, accessToken, cacheScope);
}

export async function refreshCommitSnapshot(
  owner: string,
  repo: string,
  page = 1,
  perPage = DEFAULT_PER_PAGE,
  accessToken?: string,
  cacheScope?: string
): Promise<CommitSnapshot> {
  const normalizedPerPage = Math.min(MAX_PER_PAGE, Math.max(5, perPage));
  return buildAndCacheCommitSnapshot(owner, repo, page, normalizedPerPage, accessToken, cacheScope);
}

async function buildAndCacheCommitSnapshot(
  owner: string,
  repo: string,
  page: number,
  perPage: number,
  accessToken?: string,
  cacheScope?: string
): Promise<CommitSnapshot> {
  let commits: CommitWithStatus[] = [];
  let hasMore = false;
  let rateLimited = false;
  let errorMessage: string | undefined;

  try {
    const rawCommits = await getRepoCommits(owner, repo, { page, perPage }, accessToken);
    hasMore = rawCommits.length === perPage;

    // Fetch statuses in small parallel batches to stay friendly to the GitHub rate limit.
    // Default per-page is 10, so this is at most 10 extra API calls.
    const statusResults = await fetchStatusesBatched(owner, repo, rawCommits.map((c) => c.sha), accessToken);
    rateLimited = statusResults.rateLimited;

    commits = rawCommits.map((commit, idx) => toCommitWithStatus(commit, statusResults.summaries[idx]));
  } catch (err) {
    // Access errors must propagate (not be cached as empty snapshots) so
    // fetchRepoWithAccess can retry with the viewer's own token.
    if (isPossiblyPrivateError(err) || isTokenExpiredError(err)) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    errorMessage = message;
    if (message.toLowerCase().includes("rate limit")) {
      rateLimited = true;
    }
    logger.warn("Failed to fetch commit snapshot", {
      repoFullName: `${owner}/${repo}`,
      error: message,
    });
  }

  const snapshot: CommitSnapshot = {
    commits,
    totalCount: commits.length,
    page,
    perPage,
    fetchedAt: new Date().toISOString(),
    hasMore,
    ...(rateLimited ? { rateLimited: true } : {}),
    ...(errorMessage ? { error: errorMessage } : {}),
  };

  const ttl = commits.length === 0 ? EMPTY_TTL_SECONDS : TTL_SECONDS;
  await writeSnapshot(owner, repo, page, snapshot, ttl, cacheScope);

  return snapshot;
}

async function fetchStatusesBatched(
  owner: string,
  repo: string,
  shas: string[],
  accessToken?: string
): Promise<{ summaries: CommitStatusSummary[]; rateLimited: boolean }> {
  const summaries: CommitStatusSummary[] = new Array(shas.length).fill(null).map(() => ({
    state: "neutral" as const,
    total: 0,
    failed: 0,
    pending: 0,
    checks: [],
  }));
  if (shas.length === 0) return { summaries, rateLimited: false };

  // 5 in-flight is plenty for a 10-commit page
  const BATCH_SIZE = 5;
  let rateLimited = false;

  for (let i = 0; i < shas.length; i += BATCH_SIZE) {
    const batch = shas.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((sha) => fetchOneStatus(owner, repo, sha, accessToken))
    );
    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        summaries[i + j] = result.value;
      } else {
        const reason = result.reason;
        if (reason instanceof Error && reason.message.toLowerCase().includes("rate limit")) {
          rateLimited = true;
        }
      }
    }
    if (rateLimited) break; // bail early, keep the rest as neutral
  }
  return { summaries, rateLimited };
}

async function fetchOneStatus(
  owner: string,
  repo: string,
  sha: string,
  accessToken?: string
): Promise<CommitStatusSummary> {
  const checkRuns = await getCheckRunsForRef(owner, repo, sha, accessToken);
  if (checkRuns.total_count > 0) {
    return summarizeCheckRuns(checkRuns.check_runs);
  }
  const combined = await getCombinedStatus(owner, repo, sha, accessToken);
  return summarizeCombinedStatus(combined);
}

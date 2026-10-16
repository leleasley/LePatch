import { ensureRedisConnected } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { getRepo, getReleases, getRepoContents, getRepoReadme, getUserGithubToken, isNotFoundError, type GitHubRelease, type GitHubRepo, type GitHubRepoContent } from "@/lib/github";

type RepoSnapshot = {
  repo: GitHubRepo;
  releases: GitHubRelease[];
  files: GitHubRepoContent[];
  readme: string | null;
  latestReleaseId: string | null;
  cachedAt: string;
};

export type RepoSnapshotAccess = {
  /** LePatch user whose OAuth token may see private/sponsor-gated repos. */
  userId?: string;
};

const SNAPSHOT_TTL_SECONDS = 3600;

function snapshotKey(owner: string, repo: string) {
  return `repo-snapshot:v2:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

/**
 * Private snapshots must never sit under the shared key — another user
 * without access could otherwise read them. They get a per-user key with
 * the same TTL (the "expiry" is always enforced on every read path).
 */
export function userSnapshotKey(userId: string, owner: string, repo: string) {
  return `repo-snapshot:v2:${owner.toLowerCase()}/${repo.toLowerCase()}:u:${userId}`;
}

async function readSnapshotFromRedis(key: string, owner: string, repo: string) {
  try {
    const redis = await ensureRedisConnected();
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as RepoSnapshot;
  } catch (error) {
    logger.warn("Repo snapshot cache read failed", {
      repoFullName: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function writeSnapshotToRedis(key: string, owner: string, repo: string, snapshot: RepoSnapshot) {
  try {
    const redis = await ensureRedisConnected();
    // Expire snapshots so stale data and memory growth are bounded; fresh
    // snapshots are rebuilt on new-release detection (see lib/releases.ts).
    await redis.set(key, JSON.stringify(snapshot), "EX", SNAPSHOT_TTL_SECONDS);
  } catch (error) {
    logger.warn("Repo snapshot cache write failed", {
      repoFullName: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function buildRepoSnapshot(
  owner: string,
  repo: string,
  releases?: GitHubRelease[],
  accessToken?: string
): Promise<RepoSnapshot> {
  const [repoData, repoReleases, files, readme] = await Promise.all([
    getRepo(owner, repo, accessToken),
    releases ? Promise.resolve(releases) : getReleases(owner, repo, accessToken),
    getRepoContents(owner, repo, accessToken),
    getRepoReadme(owner, repo, accessToken),
  ]);
  const latestRelease = repoReleases.find((release) => !release.draft) || null;

  return {
    repo: repoData,
    releases: repoReleases.filter((release) => !release.draft),
    files,
    readme,
    latestReleaseId: latestRelease ? String(latestRelease.id) : null,
    cachedAt: new Date().toISOString(),
  };
}

export async function getRepoSnapshot(owner: string, repo: string, access?: RepoSnapshotAccess) {
  const shared = await readSnapshotFromRedis(snapshotKey(owner, repo), owner, repo);
  if (shared) return shared;

  if (access?.userId) {
    const userCached = await readSnapshotFromRedis(userSnapshotKey(access.userId, owner, repo), owner, repo);
    if (userCached) return userCached;
  }

  try {
    const snapshot = await buildRepoSnapshot(owner, repo);
    await writeSnapshotToRedis(snapshotKey(owner, repo), owner, repo, snapshot);
    return snapshot;
  } catch (error) {
    // The shared token sees only public repos. A 404 may mean "private but
    // visible to this user" — retry once with their OAuth token and keep the
    // result under a per-user key so it never leaks to other viewers.
    if (!isNotFoundError(error) || !access?.userId) throw error;
    const token = await getUserGithubToken(access.userId);
    if (!token) throw error;
    const snapshot = await buildRepoSnapshot(owner, repo, undefined, token);
    await writeSnapshotToRedis(userSnapshotKey(access.userId, owner, repo), owner, repo, snapshot);
    return snapshot;
  }
}

export async function refreshRepoSnapshot(
  owner: string,
  repo: string,
  releases?: GitHubRelease[],
  access?: RepoSnapshotAccess & { accessToken?: string }
) {
  const token = access?.accessToken ?? (access?.userId ? await getUserGithubToken(access.userId) : null) ?? undefined;
  const snapshot = await buildRepoSnapshot(owner, repo, releases, token);
  // Private snapshots stay under the per-user key; public ones stay shared.
  const key = token && access?.userId
    ? userSnapshotKey(access.userId, owner, repo)
    : snapshotKey(owner, repo);
  await writeSnapshotToRedis(key, owner, repo, snapshot);
  return snapshot;
}

export async function clearRepoSnapshot(owner: string, repo: string, access?: RepoSnapshotAccess) {
  try {
    const redis = await ensureRedisConnected();
    const keys = [snapshotKey(owner, repo)];
    if (access?.userId) keys.push(userSnapshotKey(access.userId, owner, repo));
    await redis.del(...keys);
  } catch (error) {
    logger.warn("Repo snapshot cache delete failed", {
      repoFullName: `${owner}/${repo}`,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

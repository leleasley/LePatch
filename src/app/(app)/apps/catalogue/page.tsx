import { prisma } from "@/lib/prisma";
import { requirePageCanBrowseApps } from "@/lib/auth";
import { canManageApps } from "@/lib/rbac";
import { searchRepos, type GitHubRepo } from "@/lib/github";
import { getOrgRepos } from "@/lib/github-org";
import { CatalogueClient } from "./CatalogueClient";

export const metadata = { title: "App Catalogue" };
export const dynamic = "force-dynamic";

const TRENDING_QUERIES = ["self-hosted", "homelab", "docker", "devops-tools"];
const REMOTE_TIMEOUT_MS = 1800;

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REMOTE_TIMEOUT_MS)),
    ]);
  } catch {
    return fallback;
  }
}

async function fetchTrendingRepos(): Promise<GitHubRepo[]> {
  const query = TRENDING_QUERIES[Math.floor(Math.random() * TRENDING_QUERIES.length)];
  const result = await withTimeout(searchRepos(query), { items: [] } as { items: GitHubRepo[] });
  return result.items.slice(0, 6);
}

async function fetchCommunityScriptsRepos() {
  const repos = await withTimeout(getOrgRepos("community-scripts"), [] as Awaited<ReturnType<typeof getOrgRepos>>);
  return repos
    .filter((r) => r.stargazers_count > 100)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 8);
}

export default async function CataloguePage() {
  const user = await requirePageCanBrowseApps();
  const canAdd = canManageApps(user.role);

  const [entries, watchedApps, trendingRepos, communityRepos] = await Promise.all([
    prisma.catalogueEntry.findMany({
      where: { isActive: true },
      orderBy: [{ featuredOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    }),
    canAdd
      ? prisma.watchedApp.findMany({
          select: { id: true, repoFullName: true, name: true, latestSeenTag: true, catalogueEntryId: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    fetchTrendingRepos(),
    fetchCommunityScriptsRepos(),
  ]);

  const watchedByRepo = new Map(watchedApps.map((w) => [w.repoFullName.toLowerCase(), w]));
  const enriched = entries.map((entry) => {
    const watched = watchedByRepo.get(entry.repoFullName.toLowerCase());

    return {
      ...entry,
      githubStars: entry.githubStars,
      latestReleaseTag: entry.latestReleaseTag,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      latestReleaseAt: entry.latestReleaseAt?.toISOString() ?? null,
      githubStatsAt: entry.githubStatsAt?.toISOString() ?? null,
      isWatched: !!watched,
      watchedAppId: watched?.id || null,
    };
  });

  const serializedTrending = trendingRepos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    description: r.description,
    stars: r.stargazers_count,
    language: r.language,
    htmlUrl: r.html_url,
  }));

  const serializedCommunity = communityRepos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    description: r.description,
    stars: r.stargazers_count,
    language: r.language,
    htmlUrl: r.html_url,
    homepage: r.homepage,
    topics: r.topics || [],
  }));

  return (
    <CatalogueClient
      entries={enriched}
      watchedByRepo={Object.fromEntries(watchedByRepo)}
      trendingRepos={serializedTrending}
      communityRepos={serializedCommunity}
      canAdd={canAdd}
    />
  );
}

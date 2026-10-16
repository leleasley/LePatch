import { githubFetch, cached, type GitHubRepo } from "@/lib/github";

export async function getOrgRepos(org: string): Promise<GitHubRepo[]> {
  const cacheKey = `org-repos:${org}`;
  return cached(cacheKey, 5 * 60 * 1000, async () => {
    let allRepos: GitHubRepo[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 3) {
      const repos = await githubFetch<GitHubRepo[]>(
        `/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}&sort=stars&direction=desc`
      );
      allRepos = allRepos.concat(repos);
      hasMore = repos.length === 100;
      page++;
    }

    return allRepos;
  });
}

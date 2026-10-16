import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import type { RepoSnapshotData } from "@/components/AppDetailTabs";

async function userGithubFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "LePatch",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) throw new Error("Repository or release not found");
  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub rate limit exceeded");
  }
  if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}`);

  return (await response.json()) as T;
}

async function userGithubTextFetch(accessToken: string, path: string): Promise<string | null> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "LePatch",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) return null;

  return response.text();
}

export async function getUserRepoSnapshot(
  userId: string,
  owner: string,
  repo: string
): Promise<RepoSnapshotData> {
  const link = await prisma.gitHubLink.findUnique({
    where: { userId },
  });

  if (!link) throw new Error("GitHub account not connected");

  const accessToken = decrypt(link.accessToken);
  const encodedOwner = encodeURIComponent(owner);
  const encodedRepo = encodeURIComponent(repo);

  const [repoData, releases, files, readme] = await Promise.all([
    userGithubFetch<{
      full_name: string;
      name: string;
      owner: { login: string };
      description: string | null;
      html_url: string;
      homepage: string | null;
      stargazers_count: number;
      language: string | null;
      default_branch: string;
    }>(accessToken, `/repos/${encodedOwner}/${encodedRepo}`),

    userGithubFetch<Array<{
      id: number;
      tag_name: string;
      name: string | null;
      body: string | null;
      html_url: string;
      prerelease: boolean;
      draft: boolean;
      published_at: string | null;
    }>>(accessToken, `/repos/${encodedOwner}/${encodedRepo}/releases?per_page=30`),

    userGithubFetch<Array<{
      name: string;
      path: string;
      type: string;
      size: number;
      html_url: string;
      download_url: string | null;
    }>>(accessToken, `/repos/${encodedOwner}/${encodedRepo}/contents`).catch(() => []),

    userGithubTextFetch(accessToken, `/repos/${encodedOwner}/${encodedRepo}/readme`),
  ]);

  await prisma.gitHubLink.update({
    where: { id: link.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    repo: {
      html_url: repoData.html_url,
      full_name: repoData.full_name,
      default_branch: repoData.default_branch,
      description: repoData.description,
      stargazers_count: repoData.stargazers_count,
      language: repoData.language,
      homepage: repoData.homepage,
    },
    releases: releases.filter((r) => !r.draft),
    files: Array.isArray(files) ? files : [],
    readme,
    cachedAt: new Date().toISOString(),
  };
}

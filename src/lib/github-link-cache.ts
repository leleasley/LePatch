import { prisma } from "@/lib/prisma";

const cache = new Map<string, { linked: boolean; expiresAt: number }>();
const TTL = 5 * 60 * 1000;

export async function isGithubLinked(userId: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.linked;

  const link = await prisma.gitHubLink.findUnique({
    where: { userId },
    select: { id: true },
  });
  const linked = !!link;
  cache.set(userId, { linked, expiresAt: now + TTL });
  return linked;
}

export function invalidateGithubLinkCache(userId: string): void {
  cache.delete(userId);
}

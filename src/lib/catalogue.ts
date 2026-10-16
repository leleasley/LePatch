import { prisma } from "@/lib/prisma";
import { catalogueApps as fallbackApps, type CatalogueApp } from "../../data/catalogue";

const cache = new Map<string, { entries: Map<string, CatalogueApp>; expiresAt: number }>();
const CACHE_TTL = 60_000;

function normalizePackageName(value: string) {
  return value
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function buildCatalogueMap(): Promise<Map<string, CatalogueApp>> {
  const now = Date.now();
  const cached = cache.get("catalogueMap");
  if (cached && cached.expiresAt > now) return cached.entries;

  let dbEntries: Array<{
    name: string;
    repoFullName: string;
    description: string;
    category: string;
    packageNames: string[];
  }>;
  try {
    dbEntries = await prisma.catalogueEntry.findMany({
      where: { isActive: true },
      select: { name: true, repoFullName: true, description: true, category: true, packageNames: true },
    });
  } catch {
    dbEntries = [];
  }

  const source = dbEntries.length > 0 ? dbEntries : fallbackApps;
  const map = new Map<string, CatalogueApp>();
  for (const app of source) {
    for (const pkg of app.packageNames) {
      map.set(normalizePackageName(pkg), {
        name: app.name,
        repoFullName: app.repoFullName,
        description: app.description,
        category: app.category as CatalogueApp["category"],
        packageNames: app.packageNames,
      });
    }
  }

  cache.set("catalogueMap", { entries: map, expiresAt: now + CACHE_TTL });
  return map;
}

export async function findCatalogueAppsByPackages(packageNames: string[]): Promise<CatalogueApp[]> {
  const map = await buildCatalogueMap();
  const seen = new Set<string>();
  const matches: CatalogueApp[] = [];
  for (const pkg of packageNames) {
    const app = map.get(normalizePackageName(pkg));
    if (!app || seen.has(app.repoFullName)) continue;
    seen.add(app.repoFullName);
    matches.push(app);
  }
  return matches;
}

export function invalidateCatalogueCache() {
  cache.delete("catalogueMap");
}

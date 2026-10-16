import { AppsClient } from "./AppsClient";
import { requirePageCanManageApps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Watched repositories" };
export const dynamic = "force-dynamic";

const FILTER_KEYS = new Set(["all", "attention", "updates", "failed", "muted", "fresh"]);

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const userSession = await requirePageCanManageApps();
  const apps = await prisma.watchedApp.findMany({
    where: { userId: userSession.id },
    orderBy: { name: "asc" },
  });

  const appData = apps.map((app) => ({
    id: app.id,
    name: app.name,
    repoFullName: app.repoFullName,
    latestSeenTag: app.latestSeenTag,
    lastCheckedAt: app.lastCheckedAt?.toISOString() ?? null,
    checkStatus: app.checkStatus,
    updateAvailable: app.updateAvailable,
    notificationsEnabled: app.notificationsEnabled,
    includePrereleases: app.includePrereleases,
  }));

  return (
    <>
      <PageHeader
        title="Watched repositories"
        description="Every repository LePatch checks on a schedule, newest activity first."
      />
      <AppsClient
        initialApps={appData}
        initialTotal={appData.length}
        initialFilter={FILTER_KEYS.has(filter ?? "") ? (filter as "all" | "attention" | "updates" | "failed" | "muted" | "fresh") : "all"}
        watchedApps={appData.map((a) => ({ id: a.id, repoFullName: a.repoFullName }))}
      />
    </>
  );
}

import { AppsClient } from "./AppsClient";
import { requirePageCanManageApps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HeroCard } from "@/components/HeroCard";
import { StatPill } from "@/components/StatPill";
import { AddAppButton } from "@/components/AddAppButton";
import { LayoutGrid, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Watched Apps" };
export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const userSession = await requirePageCanManageApps();
  const apps = await prisma.watchedApp.findMany({
    where: { userId: userSession.id },
    orderBy: { name: "asc" },
  });

  const appData = apps.map((app) => {
    return {
      id: app.id,
      name: app.name,
      repoFullName: app.repoFullName,
      latestSeenTag: app.latestSeenTag,
      lastCheckedAt: app.lastCheckedAt?.toISOString() || null,
      checkStatus: app.checkStatus,
      updateAvailable: app.updateAvailable,
      notificationsEnabled: app.notificationsEnabled,
      includePrereleases: app.includePrereleases,
      serverInstallCount: 0,
      serverBehindCount: 0,
      servers: [] as Array<{
        server: { id: string; name: string; status: string; lastSeenAt: string | null; isLePatchHost: boolean };
        packages: Array<{ id: string; serverId: string; name: string; currentVersion: string | null; latestVersion: string | null; manager: string; updateAvailable: boolean }>;
        updateAvailable: boolean;
      }>,
    };
  });

  const total = apps.length;
  const updates = appData.filter((a) => a.updateAvailable).length;
  const failed = appData.filter((a) => a.checkStatus === "failed").length;
  const healthy = appData.filter((a) => a.checkStatus === "success").length;
  const notificationsOff = appData.filter((a) => !a.notificationsEnabled).length;
  const now = new Date().getTime();
  const stale = appData.filter((a) => {
    if (!a.lastCheckedAt) return true;
    return now - new Date(a.lastCheckedAt).getTime() > 24 * 60 * 60 * 1000;
  }).length;

  return (
    <>
      <HeroCard
        compact
        icon={<LayoutGrid className="h-5 w-5" />}
        kicker="Tracking"
        title={total === 0 ? "No watched apps yet" : `${total} watched app${total === 1 ? "" : "s"}`}
        subtitle={
          total === 0
            ? "Add repositories from GitHub to get release notifications the moment they go live."
            : "Track releases for GitHub repositories and get notified the moment they go live."
        }
        badges={
          total > 0 ? (
            <>
              {updates > 0 && (
                <span className="status-pill status-pill--pending">
                  {updates} update{updates === 1 ? "" : "s"} available
                </span>
              )}
              {failed > 0 && (
                <span className="status-pill status-pill--failure">
                  <AlertTriangle className="h-3 w-3" />{failed} failed
                </span>
              )}
              {stale > 0 && (
                <span className="status-pill status-pill--neutral">
                  {stale} stale
                </span>
              )}
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/apps/catalogue" className="btn btn--ghost btn--sm">
              Browse catalogue
            </Link>
            <AddAppButton
              watchedApps={appData.map((a) => ({ id: a.id, repoFullName: a.repoFullName }))}
              canAdd={true}
            />
          </div>
        }
      />

      {total > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <StatPill label="Total" value={total} />
          <StatPill label="Healthy" value={healthy} tone="success" />
          <StatPill label="Updates" value={updates} tone={updates > 0 ? "pending" : "muted"} />
          <StatPill label="Failed" value={failed} tone={failed > 0 ? "failure" : "muted"} />
          <StatPill label="Muted" value={notificationsOff} tone={notificationsOff > 0 ? "pending" : "muted"} />
          <StatPill label="Stale" value={stale} tone={stale > 0 ? "stale" : "muted"} />
        </div>
      )}

      <div className="mt-4">
        <AppsClient
          initialApps={appData}
          initialTotal={total}
          watchedApps={appData.map((a) => ({ id: a.id, repoFullName: a.repoFullName }))}
        />
      </div>
    </>
  );
}

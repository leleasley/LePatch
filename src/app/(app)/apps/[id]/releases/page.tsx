import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageCanManageApps } from "@/lib/auth";
import { ClearPendingAppName } from "@/components/ClearPendingAppName";
import { HeroCard } from "@/components/HeroCard";
import { ReleaseHistory } from "@/components/ReleaseHistory";
import { prisma } from "@/lib/prisma";
import { Tag, Code2, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await prisma.watchedApp.findUnique({ where: { id }, select: { name: true } });
  return { title: app ? `${app.name} Releases` : "Releases" };
}

export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageCanManageApps();
  const { id } = await params;
  const app = await prisma.watchedApp.findUnique({
    where: { id },
    include: {
      releases: {
        orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }],
        take: 50,
      },
    },
  });
  if (!app) notFound();

  const displayReleases = app.releases.map((release) => ({
    id: release.id,
    tagName: release.tagName,
    name: release.name,
    body: release.body,
    htmlUrl: release.htmlUrl,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.publishedAt,
    detectedAt: release.detectedAt,
    ignored: release.ignored,
    notificationSent: release.notificationSent,
  }));

  return (
    <>
      <ClearPendingAppName />

      <HeroCard
        icon={<Code2 className="h-5 w-5" />}
        kicker={
          <Link
            href={`/apps/${app.id}`}
            className="inline-flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-faint)] hover:text-[var(--theme-text-muted)] transition-colors"
          >
            ← {app.name}
          </Link>
        }
        title={`${app.name} releases`}
        subtitle={
          <>
            <span className="app-mono">{app.repoFullName}</span>
            {" · "}
            {app.releases.length} release{app.releases.length === 1 ? "" : "s"} stored
          </>
        }
        actions={
          <a
            href={app.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--sm"
          >
            View on GitHub
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        }
      />

      <div className="mt-5">
        {displayReleases.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <Tag className="h-5 w-5" />
            </span>
            <p className="empty-state-title">No releases stored yet</p>
            <p className="empty-state-copy">Run a check to populate release history for this repository.</p>
            <Link href={`/apps/${app.id}`} className="btn btn--primary btn--sm mt-4">
              Back to app
            </Link>
          </div>
        ) : (
          <ReleaseHistory releases={displayReleases} />
        )}
      </div>
    </>
  );
}

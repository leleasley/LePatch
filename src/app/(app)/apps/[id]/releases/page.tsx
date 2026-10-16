import { notFound } from "next/navigation";
import { requirePageCanManageApps } from "@/lib/auth";
import { ClearPendingAppName } from "@/components/ClearPendingAppName";
import { PageHeader, MetaItem } from "@/components/ui/PageHeader";
import { ReleaseHistory } from "@/components/ReleaseHistory";
import { EmptyState } from "@/components/ui/Card";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/time-ago";
import { ExternalLink, Hash, Tag } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const app = await prisma.watchedApp.findUnique({ where: { id }, select: { name: true } });
  return { title: app ? `${app.name} releases` : "Releases" };
}

export default async function ReleasesPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageCanManageApps();
  const { id } = await params;

  const app = await prisma.watchedApp.findUnique({
    where: { id },
    include: {
      releases: { orderBy: [{ publishedAt: "desc" }, { detectedAt: "desc" }], take: 100 },
    },
  });
  if (!app) notFound();

  const releases = app.releases.map((release) => ({
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
    releaseType: release.releaseType,
  }));

  const latest = releases[0] ?? null;

  return (
    <>
      <ClearPendingAppName />

      <PageHeader
        breadcrumb={[{ label: "Watched repositories", href: "/apps" }, { label: app.name, href: `/apps/${app.id}` }, { label: "Releases" }]}
        title={`${app.name} releases`}
        description="Every release LePatch has stored for this repository, newest first."
        meta={
          <>
            <MetaItem icon={<Hash className="h-3.5 w-3.5" />}>{releases.length} stored</MetaItem>
            {latest && <MetaItem icon={<Tag className="h-3.5 w-3.5" />}>latest {latest.tagName}</MetaItem>}
            {latest && <span>detected {formatRelativeTime(latest.detectedAt)}</span>}
          </>
        }
        actions={
          <>
            <a href={app.githubUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              GitHub
            </a>
            <a href={`/apps/${app.id}`} className="btn btn--primary btn--sm">
              Repository overview
            </a>
          </>
        }
      />

      {releases.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-4 w-4" />}
          title="No releases stored yet"
          description="Run a check to populate release history for this repository."
          action={
            <a href={`/apps/${app.id}`} className="btn btn--primary btn--sm">
              Back to repository
            </a>
          }
        />
      ) : (
        <ReleaseHistory releases={releases} />
      )}
    </>
  );
}
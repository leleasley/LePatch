import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { requirePageCanManageApps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, MetaItem } from "@/components/ui/PageHeader";
import { Panel, StatusDot } from "@/components/ui/List";
import { EmptyState } from "@/components/ui/Card";
import { ReleaseNotes } from "@/components/ReleaseNotes";
import { ReleasePageActions } from "./ReleasePageActions";
import { formatRelativeTime } from "@/lib/time-ago";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string; releaseId: string }> }) {
  const { releaseId } = await params;
  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { tagName: true } });
  return { title: release ? `Release ${release.tagName}` : "Release" };
}

/**
 * One release, one URL.
 *
 * A release tracker earns its keep here: the full notes rendered properly,
 * version context (what came before and after), and the actions that clear it
 * from your queue — not an expander row in a table.
 */
export default async function ReleasePage({ params }: { params: Promise<{ id: string; releaseId: string }> }) {
  const session = await requirePageCanManageApps();
  const { id, releaseId } = await params;

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: { watchedApp: { select: { id: true, userId: true, name: true, repoFullName: true, githubUrl: true } } },
  });
  if (!release || release.watchedApp.id !== id || release.watchedApp.userId !== session.id) notFound();
  const app = release.watchedApp;

  const [previous, next] = await Promise.all([
    prisma.release.findFirst({
      where: { watchedAppId: id, detectedAt: { lt: release.detectedAt } },
      orderBy: { detectedAt: "desc" },
      select: { id: true, tagName: true },
    }),
    prisma.release.findFirst({
      where: { watchedAppId: id, detectedAt: { gt: release.detectedAt } },
      orderBy: { detectedAt: "asc" },
      select: { id: true, tagName: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Watched repositories", href: "/apps" },
          { label: app.name, href: `/apps/${app.id}` },
          { label: "Releases", href: `/apps/${app.id}/releases` },
          { label: release.tagName },
        ]}
        title={<span className="mono">{release.tagName}</span>}
        description={release.name && release.name !== release.tagName ? release.name : undefined}
        meta={
          <>
            <StatusDot tone={release.prerelease ? "warning" : "neutral"}>
              {release.prerelease ? "pre-release" : (release.releaseType ?? "release")}
            </StatusDot>
            <MetaItem>
              published {release.publishedAt ? formatRelativeTime(release.publishedAt) : "date unknown"}
            </MetaItem>
            <MetaItem>detected {formatRelativeTime(release.detectedAt)}</MetaItem>
            {release.notificationSent ? (
              <StatusDot tone="success">notification sent</StatusDot>
            ) : (
              <StatusDot tone="neutral">not notified</StatusDot>
            )}
            {release.ignored && <StatusDot tone="neutral">ignored</StatusDot>}
          </>
        }
        actions={
          <>
            <a href={release.htmlUrl} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              GitHub
            </a>
            <ReleasePageActions
              appId={app.id}
              releaseId={release.id}
              ignored={release.ignored}
              appName={app.name}
            />
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Panel
          title="Release notes"
          description={release.notificationSent ? "Delivered to your channels." : undefined}
          flush
          bodyClassName="px-4 py-4 sm:px-5 sm:py-5"
        >
          {release.body ? (
            <ReleaseNotes body={release.body} />
          ) : (
            <EmptyState title="No release notes" description="The publisher shipped this tag without notes." />
          )}
        </Panel>

        <aside className="flex flex-col gap-4">
          <Panel title="Version context">
            <div className="flex flex-col gap-1 text-sm">
              {previous ? (
                <Link
                  href={`/apps/${app.id}/releases/${previous.id}`}
                  className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface"
                >
                  <ArrowLeft className="h-3.5 w-3.5 text-text-faint" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-2xs uppercase tracking-wide text-text-faint">Previous</span>
                    <span className="mono block truncate text-text group-hover:text-accent">{previous.tagName}</span>
                  </span>
                </Link>
              ) : (
                <p className="px-2 py-1.5 text-xs text-text-faint">No earlier release stored.</p>
              )}
              {next ? (
                <Link
                  href={`/apps/${app.id}/releases/${next.id}`}
                  className="group flex items-center justify-end gap-2 rounded-md px-2 py-1.5 text-right transition-colors hover:bg-surface"
                >
                  <span className="min-w-0">
                    <span className="block text-2xs uppercase tracking-wide text-text-faint">Next</span>
                    <span className="mono block truncate text-text group-hover:text-accent">{next.tagName}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-text-faint" aria-hidden="true" />
                </Link>
              ) : (
                <p className="px-2 py-1.5 text-right text-xs text-text-faint">This is the latest stored release.</p>
              )}
            </div>
          </Panel>

          <Panel title="Repository">
            <Link
              href={`/apps/${app.id}`}
              className="mono block truncate text-sm text-accent hover:underline"
            >
              {app.repoFullName}
            </Link>
            <p className="mt-1 text-xs text-text-muted">Watched as {app.name}.</p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

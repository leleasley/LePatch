import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { IssuePage } from "@/components/IssuePage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string; issueNumber: string }> }) {
  const { id, issueNumber } = await params;
  const app = await prisma.watchedApp.findUnique({ where: { id }, select: { name: true } });
  return { title: app ? `#${issueNumber} - ${app.name}` : `Issue #${issueNumber}` };
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string; issueNumber: string }>;
}) {
  const { id, issueNumber } = await params;

  const app = await prisma.watchedApp.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      repoOwner: true,
      repoName: true,
    },
  });

  if (!app) notFound();

  return (
    <IssuePage
      owner={app.repoOwner}
      repo={app.repoName}
      issueNumber={parseInt(issueNumber, 10)}
    />
  );
}

import { PageHeader } from "@/components/ui/PageHeader";
import { ProfileTabs } from "./ProfileTabs";
import { getCurrentPageUser, requirePageSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  await requirePageSession();
  const user = await getCurrentPageUser();

  const githubLink = await prisma.gitHubLink.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader
        title="Profile"
        description="Manage your account, security, integrations, and notification preferences."
      />

      <ProfileTabs isAdmin={user.role === "administrator"} githubLinked={!!githubLink} />
      {children}
    </div>
  );
}

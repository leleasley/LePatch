import { UserCircle2 } from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
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
    <>
      <HeroCard
        icon={<UserCircle2 className="h-5 w-5" />}
        title="Profile"
        subtitle="Manage your account, security, and notification preferences."
      />

      <ProfileTabs isAdmin={user.role === "administrator"} githubLinked={!!githubLink} />
      {children}
    </>
  );
}

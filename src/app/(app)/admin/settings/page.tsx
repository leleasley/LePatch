import { requirePageModerator } from "@/lib/auth";
import { isAdministrator } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Settings } from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
import type { UserRole } from "@prisma/client";
import { SettingsTabs } from "./SettingsTabs";

export const metadata = { title: "Admin Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePageModerator();
  const admin = isAdministrator(user.role);

  const settings: Record<string, string> = {};

  const systemSettings = await prisma.systemSetting.findMany();
  for (const s of systemSettings) {
    settings[s.key] = s.value;
  }

  let users: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    createdAt: string;
    updatedAt: string;
    passwordEnabled: boolean;
  }[] = [];

  let categories: string[] = [];

  if (admin) {
    const rawUsers = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        passwordEnabled: true,
      },
    });
    users = rawUsers.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }));
  }

  const categoryGroups = await prisma.catalogueEntry.groupBy({
    by: ["category"],
    _count: true,
  });
  categories = categoryGroups.map((c) => c.category);

  return (
    <>
      <HeroCard
        icon={<Settings className="h-5 w-5" />}
        title="Settings"
        subtitle="Configure application, integrations, and services."
      />
      <SettingsTabs
        settings={settings}
        role={user.role}
        users={users}
        currentUserId={user.id}
        initialCategories={categories}
      />
    </>
  );
}

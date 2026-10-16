import { requirePageCanBrowseApps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SearchClient } from "./SearchClient";
import { canManageApps } from "@/lib/rbac";

export const metadata = { title: "Search GitHub" };
export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await requirePageCanBrowseApps();
  const canAdd = canManageApps(user.role);
  const watchedApps = canAdd
    ? await prisma.watchedApp.findMany({
        select: { id: true, repoFullName: true }
      })
    : [];
  return <SearchClient watchedApps={watchedApps} canAdd={canAdd} />;
}

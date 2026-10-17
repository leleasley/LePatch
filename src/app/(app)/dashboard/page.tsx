import { requirePageCanManageApps } from "@/lib/auth";
import { loadDashboardData } from "@/lib/dashboard-data";
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userSession = await requirePageCanManageApps();
  const initialData = await loadDashboardData(userSession.id);

  return <DashboardClient initialData={initialData} />;
}

import { requirePageAdmin } from "@/lib/auth";
import { LogsClient } from "./LogsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Logs & Queues - LePatch",
};

export default async function LogsPage() {
  await requirePageAdmin();
  return <LogsClient />;
}

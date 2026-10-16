import { requirePageAdmin } from "@/lib/auth";
import { LogsClient } from "./LogsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Logs & Queues - LePatch",
};

export default function LogsPage() {
  requirePageAdmin();
  return <LogsClient />;
}

import { redirect } from "next/navigation";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  redirect("/profile/notifications");
}

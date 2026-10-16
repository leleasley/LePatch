import { requirePageAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationsClient } from "@/app/(app)/notifications/NotificationsClient";
import { NotificationPreferencesSection } from "./NotificationPreferencesSection";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function ProfileNotificationsPage() {
  await requirePageAdmin();

  const [events, total, pending, failed, sent] = await Promise.all([
    prisma.notificationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        release: {
          include: {
            watchedApp: { select: { id: true, name: true, repoFullName: true, slug: true } },
          },
        },
        channel: { select: { id: true, type: true, name: true } },
      },
    }),
    prisma.notificationEvent.count(),
    prisma.notificationEvent.count({ where: { status: "pending" } }),
    prisma.notificationEvent.count({ where: { status: "failed" } }),
    prisma.notificationEvent.count({ where: { status: "sent" } }),
  ]);

  return (
    <div className="space-y-6">
      <NotificationPreferencesSection />
      <div className="rounded-xl border border-line/50 bg-panel/80 p-5">
        <h2 className="text-xl font-semibold text-text">Delivery History</h2>
        <p className="mt-1 text-sm text-text-muted">Recent notification events from Discord and Telegram Bot release alerts.</p>
      </div>
      <NotificationsClient initialData={{ events, total, pending, failed, sent }} />
    </div>
  );
}

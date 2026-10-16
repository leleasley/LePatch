import { requirePageAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { History } from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
import { DeliveryHistoryClient } from "./DeliveryHistoryClient";

export const metadata = { title: "Delivery History" };
export const dynamic = "force-dynamic";

export default async function DeliveryHistoryPage() {
  await requirePageAdmin();

  const [events, total, pending, failed, sent, channels] = await Promise.all([
        prisma.notificationEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            release: {
              include: {
                watchedApp: { select: { id: true, name: true, repoFullName: true, slug: true } },
              },
            },
            channel: { select: { id: true, type: true, name: true, enabled: true } },
          },
        }),
    prisma.notificationEvent.count(),
    prisma.notificationEvent.count({ where: { status: "pending" } }),
    prisma.notificationEvent.count({ where: { status: "failed" } }),
    prisma.notificationEvent.count({ where: { status: "sent" } }),
    prisma.notificationChannel.findMany({ select: { id: true, type: true, name: true, enabled: true } }),
    // channels are included below; mapped for the client
  ]);

  return (
    <div>
      <HeroCard
        icon={<History className="h-5 w-5" />}
        title="Delivery History"
        subtitle="Full delivery history for all notification channels."
      />
      <DeliveryHistoryClient initialData={{
        events: events.map((e) => ({
          ...e,
          sentAt: e.sentAt ? e.sentAt.toISOString() : null,
          createdAt: e.createdAt.toISOString(),
          error: e.error,
        })),
        total, pending, failed, sent, channels,
      }} />
    </div>
  );
}

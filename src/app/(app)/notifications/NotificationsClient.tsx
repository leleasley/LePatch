"use client";

import { AlertTriangle, Bell, CheckCircle2, Clock } from "lucide-react";
import { List, ListRow, MetricStrip, Panel, StatusDot, type StatusTone } from "@/components/ui/List";
import { EmptyState } from "@/components/ui/Card";
import { useNotifications } from "@/lib/use-swr";
import { RelativeTime } from "@/components/RelativeTime";

type NotificationEvent = {
  id: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  error: string | null;
  release: {
    tagName: string;
    htmlUrl: string;
    watchedApp: { id: string; name: string; repoFullName: string };
  };
  channel: { id: string; type: string; name: string };
};

function statusTone(status: string): StatusTone {
  if (status === "sent") return "success";
  if (status === "failed") return "danger";
  return "warning";
}

export function NotificationsClient({
  initialData,
}: {
  initialData: { events: NotificationEvent[]; total: number; pending: number; failed: number; sent: number };
}) {
  const { data } = useNotifications();
  const events = data?.events ?? initialData.events;
  const total = data?.total ?? initialData.total;
  const pending = data?.pending ?? initialData.pending;
  const failed = data?.failed ?? initialData.failed;
  const sent = data?.sent ?? initialData.sent;

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip
        items={[
          { label: "Events", value: total },
          { label: "Sent", value: sent, tone: sent > 0 ? "success" : undefined },
          { label: "Pending", value: pending, tone: pending > 0 ? "warning" : undefined },
          { label: "Failed", value: failed, tone: failed > 0 ? "danger" : undefined },
        ]}
      />

      <Panel
        title="Delivery history"
        description="One row per release per channel. Retries resolve to a single eventual delivery."
        actions={
          <span className="inline-flex items-center gap-1.5 text-xs text-text-faint">
            <Bell className="h-3.5 w-3.5" aria-hidden="true" />
            {events.length} shown
          </span>
        }
        flush
      >
        {events.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Bell className="h-4 w-4" />}
              title="No deliveries yet"
              description="Once a watched repository publishes a release, its delivery appears here."
            />
          </div>
        ) : (
          <List>
            {events.map((event) => (
              <ListRow
                key={event.id}
                title={
                  <>
                    <a
                      href={event.release.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono truncate text-sm font-medium text-accent hover:underline"
                    >
                      {event.release.tagName}
                    </a>
                    <StatusDot tone={statusTone(event.status)}>{event.status}</StatusDot>
                  </>
                }
                subtitle={`${event.release.watchedApp.name} · ${event.release.watchedApp.repoFullName}`}
                meta={
                  <>
                    <span className="capitalize">{event.channel.name}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      queued <RelativeTime value={event.createdAt} />
                    </span>
                    {event.sentAt && (
                      <span className="inline-flex items-center gap-1.5 text-status-success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        sent <RelativeTime value={event.sentAt} />
                      </span>
                    )}
                    {event.error && (
                      <span className="inline-flex items-center gap-1.5 text-status-danger">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        {event.error}
                      </span>
                    )}
                  </>
                }
              />
            ))}
          </List>
        )}
      </Panel>
    </div>
  );
}
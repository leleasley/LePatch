"use client";

import Link from "next/link";
import { StatCard } from "@/components/StatCard";
import { useNotifications } from "@/lib/use-swr";
import { Bell, CheckCircle, AlertTriangle, Clock } from "lucide-react";

type NotificationEvent = {
  id: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  error: string | null;
  release: {
    tagName: string;
    htmlUrl: string;
    watchedApp: {
      id: string;
      name: string;
      repoFullName: string;
    };
  };
  channel: {
    id: string;
    type: string;
    name: string;
  };
};

function formatDate(value: Date | null) {
  return value ? value.toLocaleString() : "N/A";
}

export function NotificationsClient({ initialData }: { initialData: { events: NotificationEvent[]; total: number; pending: number; failed: number; sent: number } }) {
  const { data } = useNotifications();
  const events = data?.events || initialData.events;
  const total = data?.total ?? initialData.total;
  const pending = data?.pending ?? initialData.pending;
  const failed = data?.failed ?? initialData.failed;
  const sent = data?.sent ?? initialData.sent;

  return (
    <>
      <div className="mobile-stat-strip mb-6 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total events" value={String(total)} icon={<Bell className="h-4 w-4" />} accent="cyan" />
        <StatCard label="Sent" value={String(sent)} icon={<CheckCircle className="h-4 w-4" />} accent="green" />
        <StatCard label="Pending" value={String(pending)} icon={<Clock className="h-4 w-4" />} accent="amber" />
        <StatCard label="Failed" value={String(failed)} icon={<AlertTriangle className="h-4 w-4" />} accent="red" />
      </div>

      <div className="overflow-hidden rounded-xl border border-line/50 bg-panel/80 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-line/50 px-5 py-3">
          <h2 className="text-lg font-semibold tracking-tight text-text">Recent delivery events</h2>
          <Link href="/admin/settings" className="text-sm text-accent hover:text-accent transition-colors">
            Open Admin Settings
          </Link>
        </div>

        {events.length === 0 ? (
          <p className="p-5 text-sm text-text-muted">No notification events recorded yet.</p>
        ) : (
          <>
            {/* Desktop table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/[0.03] text-left text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">App</th>
                    <th className="px-4 py-3 font-medium">Channel</th>
                    <th className="px-4 py-3 font-medium">Release</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Sent</th>
                    <th className="px-4 py-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/50">
                  {events.map((event) => (
                    <tr key={event.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-text">{event.release.watchedApp.name}</div>
                        <div className="text-xs text-text-muted">{event.release.watchedApp.repoFullName}</div>
                      </td>
                      <td className="px-4 py-3 text-text">{event.channel.name}</td>
                      <td className="px-4 py-3">
                        <a href={event.release.htmlUrl} target="_blank" className="text-accent hover:text-accent transition-colors">
                          {event.release.tagName}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        {event.status === "sent" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-status-success">sent</span>}
                        {event.status === "failed" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-danger/30 bg-status-danger/10 px-2.5 py-0.5 text-xs font-medium text-status-danger">failed</span>}
                        {event.status === "pending" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/30 bg-status-warning/10 px-2.5 py-0.5 text-xs font-medium text-status-warning">pending</span>}
                      </td>
                      <td className="px-4 py-3 text-text-muted">{formatDate(event.createdAt)}</td>
                      <td className="px-4 py-3 text-text-muted">{formatDate(event.sentAt)}</td>
                      <td className="px-4 py-3 text-xs text-status-danger max-w-[200px] truncate">{event.error || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards (< md) */}
            <div className="md:hidden divide-y divide-line/50">
              {events.map((event) => (
                <div key={event.id} className="px-4 py-3 transition-colors hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-text truncate">{event.release.watchedApp.name}</div>
                      <div className="text-xs text-text-muted truncate">{event.release.watchedApp.repoFullName}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-text-muted">{event.channel.name}</span>
                        <a href={event.release.htmlUrl} target="_blank" className="text-xs text-accent hover:text-accent transition-colors">
                          {event.release.tagName}
                        </a>
                      </div>
                      <div className="mt-1 text-xs text-text-muted">{formatDate(event.createdAt)}</div>
                      {event.error && (
                        <div className="mt-1 text-xs text-status-danger truncate">{event.error}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {event.status === "sent" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-success/30 bg-status-success/10 px-2.5 py-0.5 text-xs font-medium text-status-success">sent</span>}
                      {event.status === "failed" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-danger/30 bg-status-danger/10 px-2.5 py-0.5 text-xs font-medium text-status-danger">failed</span>}
                      {event.status === "pending" && <span className="inline-flex items-center gap-1.5 rounded-full border border-status-warning/30 bg-status-warning/10 px-2.5 py-0.5 text-xs font-medium text-status-warning">pending</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

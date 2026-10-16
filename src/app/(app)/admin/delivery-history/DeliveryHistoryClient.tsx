"use client";

import { useState } from "react";
import { Bell, BellOff, Check, XCircle, Clock } from "lucide-react";

type Channel = { id: string; type: string; name: string; enabled?: boolean };
type Event = {
  id: string;
  status: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  channel: Channel | null;
  release: {
    tagName: string;
    watchedApp: { name: string; repoFullName: string; slug: string };
  } | null;
};

export function DeliveryHistoryClient({ initialData }: { initialData: { events: Event[]; total: number; pending: number; failed: number; sent: number; channels: Channel[] } }) {
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? initialData.events : initialData.events.filter((e) => e.status === filter);

  function timeAgo(date: string | null) {
    if (!date) return "";
    const d = new Date(date);
    // eslint-disable-next-line react-hooks/purity
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line/50 bg-panel/80 p-4"><span className="text-xs text-slate-500">Total</span><div className="text-xl font-bold text-white">{initialData.total}</div></div>
        <div className="rounded-xl border border-line/50 bg-panel/80 p-4"><span className="text-xs text-slate-500">Sent</span><div className="text-xl font-bold text-emerald-300">{initialData.sent}</div></div>
        <div className="rounded-xl border border-line/50 bg-panel/80 p-4"><span className="text-xs text-slate-500">Failed</span><div className="text-xl font-bold text-red-300">{initialData.failed}</div></div>
        <div className="rounded-xl border border-line/50 bg-panel/80 p-4"><span className="text-xs text-slate-500">Pending</span><div className="text-xl font-bold text-amber-300">{initialData.pending}</div></div>
      </div>

      {/* Channels */}
      <div className="rounded-xl border border-line/50 bg-panel/80 p-4">
        <h3 className="text-sm font-semibold text-white mb-2">Channels</h3>
        <div className="flex flex-wrap gap-2">
          {initialData.channels.map((ch) => (
            <span key={ch.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${ch.enabled !== false ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/10 text-slate-400"}`}>
              {ch.enabled !== false ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              {ch.type} {ch.enabled !== false ? "enabled" : "disabled"}
            </span>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {["all", "sent", "failed", "pending"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${filter === s ? "bg-cyan-500/20 text-cyan-300" : "text-slate-400 hover:text-white"}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {/* Events */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No events found.</p>
        ) : (
          filtered.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-line/50 bg-panel/80 p-4 flex items-start gap-3">
              <div className={`rounded-lg p-2 ${ev.status === "sent" ? "bg-emerald-500/10" : ev.status === "failed" ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                {ev.status === "sent" ? <Check className="h-4 w-4 text-emerald-400" /> : ev.status === "failed" ? <XCircle className="h-4 w-4 text-red-400" /> : <Clock className="h-4 w-4 text-amber-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-medium ${ev.status === "sent" ? "text-emerald-300" : ev.status === "failed" ? "text-red-300" : "text-amber-300"}`}>{ev.status}</span>
                  {ev.channel && <span className="text-xs text-slate-400">{ev.channel.type} · {ev.channel.name}</span>}
                  {ev.release && (
                    <span className="text-xs text-slate-500 truncate">
                      {ev.release.watchedApp.name} · {ev.release.tagName}
                    </span>
                  )}
                </div>
                {ev.error && <p className="mt-1 text-xs text-red-400">{ev.error}</p>}
                <p className="mt-0.5 text-[10px] text-slate-600">{ev.createdAt ? timeAgo(ev.createdAt) : ""} {ev.sentAt ? `· sent ${timeAgo(ev.sentAt)}` : ""}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

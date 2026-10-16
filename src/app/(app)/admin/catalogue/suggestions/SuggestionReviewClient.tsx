"use client";

import { useState, useCallback } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { Check, X, Clock, ExternalLink, RefreshCw, AlertCircle, Search } from "lucide-react";

type Submitter = { id: string; name: string | null; email: string | null } | null;
type Reviewer = { id: string; name: string | null; email: string | null } | null;

type Suggestion = {
  id: string;
  name: string;
  repoFullName: string;
  description: string;
  category: string;
  packageNames: string[];
  submittedBy: string | null;
  submitter: Submitter;
  status: "pending" | "approved" | "rejected";
  notes: string | null;
  reviewedBy: string | null;
  reviewer: Reviewer;
  reviewedAt: string | null;
  createdAt: string;
};

export function SuggestionReviewClient({ initialSuggestions }: { initialSuggestions: Suggestion[] }) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [loading, setLoading] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [search, setSearch] = useState("");

  const filtered = suggestions.filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.repoFullName.toLowerCase().includes(q);
    }
    return true;
  });

  const pending = filtered.filter((s) => s.status === "pending");
  const reviewed = filtered.filter((s) => s.status !== "pending");

  const handleAction = useCallback(async (id: string, action: "approve" | "reject") => {
    setLoading(id);
    setError("");
    try {
      const res = await csrfFetch(`/api/admin/catalogue/suggestions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes[id] || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Action failed");
        return;
      }

      const data = await res.json();
      setSuggestions((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            return {
              ...s,
              status: data.suggestion.status,
              notes: notes[id] || null,
              reviewedAt: new Date().toISOString(),
            };
          }
          return s;
        })
      );
    } catch {
      setError("Failed to process suggestion");
    } finally {
      setLoading(null);
    }
  }, [notes]);

  const categoryClass = (cat: string) => {
    const base = "rounded-full px-2 py-1 text-xs font-medium";
    const colors: Record<string, string> = {
      media: "bg-fuchsia-400/15 text-fuchsia-200",
      identity: "bg-amber-400/15 text-amber-200",
      monitoring: "bg-emerald-400/15 text-emerald-200",
      infrastructure: "bg-cyan-400/15 text-cyan-200",
      documents: "bg-sky-400/15 text-sky-200",
    };
    return `${base} ${colors[cat] || "bg-slate-400/15 text-slate-200"}`;
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  function renderSuggestion(s: Suggestion) {
    return (
      <div key={s.id} className="rounded-xl border border-line/50 bg-panel/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-medium text-white">{s.name}</h3>
              <span className={categoryClass(s.category)}>{s.category.charAt(0).toUpperCase() + s.category.slice(1)}</span>
              {s.status === "pending" && (
                <span className="rounded-full bg-amber-400/10 px-2 py-1 text-xs text-amber-200">Pending</span>
              )}
              {s.status === "approved" && (
                <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">Approved</span>
              )}
              {s.status === "rejected" && (
                <span className="rounded-full bg-red-400/10 px-2 py-1 text-xs text-red-200">Rejected</span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">{s.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <a
                href={`https://github.com/${s.repoFullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
              >
                {s.repoFullName}
                <ExternalLink className="h-3 w-3" />
              </a>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(s.createdAt)}
              </span>
              <span>
                by {s.submitter?.name || s.submitter?.email || s.submittedBy?.slice(0, 8) || "unknown"}
              </span>
              {s.packageNames.length > 0 && (
                <span>Packages: {s.packageNames.join(", ")}</span>
              )}
            </div>
            {s.status !== "pending" && s.reviewer && (
              <p className="mt-1 text-xs text-slate-500">
                Reviewed by {s.reviewer.name || s.reviewer.email} on {s.reviewedAt ? formatDate(s.reviewedAt) : "?"}
              </p>
            )}
            {s.notes && (
              <p className="mt-1 text-xs text-slate-400 italic">Note: {s.notes}</p>
            )}
          </div>

          {s.status === "pending" && (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(s.id, "approve")}
                  disabled={loading === s.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleAction(s.id, "reject")}
                  disabled={loading === s.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Reject
                </button>
              </div>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={notes[s.id] || ""}
                onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="w-full rounded-md border border-line/50 bg-white/5 px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none sm:w-48"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search suggestions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-line/50 bg-panel/80 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-line/50 bg-panel/80 p-1">
          {(["all", "pending", "approved", "rejected"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-cyan-500/10 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-slate-500">{filtered.length} suggestion{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-slate-400 uppercase tracking-wider">Pending Review</h2>
          <div className="space-y-3">
            {pending.map(renderSuggestion)}
          </div>
        </section>
      )}

      {reviewed.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium text-slate-400 uppercase tracking-wider">Reviewed</h2>
          <div className="space-y-3">
            {reviewed.map(renderSuggestion)}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <RefreshCw className="mb-3 h-12 w-12 text-slate-600" />
          <p className="text-lg font-medium text-slate-400">No suggestions found</p>
          <p className="mt-1 text-sm">Suggestions will appear here when users submit them</p>
        </div>
      )}
    </div>
  );
}

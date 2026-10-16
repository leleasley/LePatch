"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppDetailLink } from "@/components/AppDetailLink";
import { csrfFetch } from "@/lib/csrf-client";

function buttonSizeClasses(size: "sm" | "xs") {
  if (size === "xs") return "gap-1.5 rounded-md px-3 py-2 text-xs";
  return "gap-2 rounded-md px-3 py-2 text-sm";
}

function iconSizeClasses(size: "sm" | "xs") {
  return size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";
}

export function AddRepoButton({ repoFullName, name, initialAdded = false, appId, size = "sm", catalogueEntryId, canAdd = true }: { repoFullName: string; name?: string; initialAdded?: boolean; appId?: string; size?: "sm" | "xs"; catalogueEntryId?: string; canAdd?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(initialAdded);
  const [watchedAppId, setWatchedAppId] = useState(appId);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function add() {
    setLoading(true);
    setMessage("");
    const response = await csrfFetch("/api/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoFullName, name, ...(catalogueEntryId ? { catalogueEntryId } : {}) })
    });
    setLoading(false);
    if (!response.ok) {
      setMessage((await response.json()).error || "Unable to add");
      return;
    }
    const data = await response.json();
    setWatchedAppId(data.app?.id);
    setAdded(true);
    setMessage("");
    router.refresh();
  }

  if (added) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center border border-emerald-400/40 bg-emerald-400/10 font-medium text-emerald-200 ${buttonSizeClasses(size)}`}>
          <Check className={iconSizeClasses(size)} />
          Added
        </span>
        {watchedAppId && (
          <AppDetailLink href={`/apps/${watchedAppId}`} appName={name || repoFullName} className={`focus-ring border border-line text-slate-200 hover:bg-white/5 ${buttonSizeClasses(size)}`}>
            View
          </AppDetailLink>
        )}
      </div>
    );
  }

  if (!canAdd) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={add}
        disabled={loading}
        className={`focus-ring inline-flex items-center bg-cyan-500 font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-60 ${buttonSizeClasses(size)}`}
      >
        <Plus className={iconSizeClasses(size)} />
        {loading ? "Adding" : "Add"}
      </button>
      {message && <span className="text-xs text-slate-400">{message}</span>}
    </div>
  );
}

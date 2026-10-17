"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppDetailLink } from "@/components/AppDetailLink";
import { csrfFetch } from "@/lib/csrf-client";
import { cn } from "@/lib/cn";

export function AddRepoButton({ repoFullName, name, initialAdded = false, appId, size = "sm", canAdd = true }: { repoFullName: string; name?: string; initialAdded?: boolean; appId?: string; size?: "sm" | "xs"; canAdd?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(initialAdded);
  const [watchedAppId, setWatchedAppId] = useState(appId);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function add() {
    setLoading(true);
    setMessage("");
    try {
      const response = await csrfFetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoFullName, name })
      });
      if (!response.ok) {
        setMessage((await response.json()).error || "Unable to add");
        return;
      }
      const data = await response.json();
      setWatchedAppId(data.app?.id);
      setAdded(true);
      setMessage("");
      window.dispatchEvent(new Event("lepatch:apps-changed"));
      router.refresh();
    } catch {
      setMessage("Could not add this repository. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (added) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge--success">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Added
        </span>
        {watchedAppId && (
          <AppDetailLink
            href={`/apps/${watchedAppId}`}
            appName={name || repoFullName}
            className={cn("btn btn--secondary", size === "xs" ? "btn--sm" : "")}
          >
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
        type="button"
        onClick={add}
        disabled={loading}
        className={cn("btn btn--primary", size === "xs" ? "btn--sm" : "")}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        {loading ? "Adding" : "Add"}
      </button>
      {message && <span role="alert" className="text-xs text-status-danger">{message}</span>}
    </div>
  );
}

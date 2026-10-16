"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellOff, Check, RefreshCw, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { csrfFetch } from "@/lib/csrf-client";

async function post(url: string, body?: unknown) {
  const response = await csrfFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) throw new Error((await response.json()).error || "Request failed");
}

export function AppActions({ appId, size = "sm" }: { appId: string; size?: "sm" | "xs" | "icon" }) {
  const router = useRouter();

  if (size === "icon") {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Check for new release"
          aria-label="Check for new release"
          className="icon-button"
          onClick={async () => {
            await post(`/api/apps/${appId}/check`);
            router.refresh();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Mark current release as seen"
          aria-label="Mark current release as seen"
          className="icon-button"
          onClick={async () => {
            await post("/api/releases/seen", { watchedAppId: appId });
            router.refresh();
          }}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={async () => {
          await post(`/api/apps/${appId}/check`);
          router.refresh();
        }}
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Check
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={async () => {
          await post("/api/releases/seen", { watchedAppId: appId });
          router.refresh();
        }}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Mark seen
      </button>
    </div>
  );
}

export function RemoveAppButton({ appId, size = "sm" }: { appId: string; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button type="button" className={`btn btn--danger ${size === "xs" ? "btn--sm" : ""}`} onClick={() => setConfirmOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        Remove
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Remove app"
        message="Are you sure you want to remove this app and all its releases?"
        confirmLabel="Remove"
        variant="danger"
        confirmText="REMOVE"
        onConfirm={async () => {
          const res = await csrfFetch(`/api/apps/${appId}`, { method: "DELETE" });
          if (!res.ok) return;
          router.push("/apps");
          router.refresh();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

export function DisableNotificationsButton({ appId, size = "sm" }: { appId: string; size?: "sm" | "xs" }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`btn btn--secondary ${size === "xs" ? "btn--sm" : ""}`}
        onClick={() => setConfirmOpen(true)}
      >
        <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
        Disable notifications
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Disable notifications"
        message="Are you sure you want to disable notifications for this app?"
        confirmLabel="Disable"
        onConfirm={async () => {
          await csrfFetch(`/api/apps/${appId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationsEnabled: false })
          });
          router.refresh();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

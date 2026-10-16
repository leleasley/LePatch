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

function buttonSizeClasses(size: "sm" | "xs" | "icon") {
  if (size === "icon") return "rounded-md p-1.5";
  if (size === "xs") return "gap-1 rounded-md px-2 py-1 text-xs";
  return "gap-1.5 rounded-md px-2.5 py-1.5 text-xs";
}

function iconSizeClasses(size: "sm" | "xs" | "icon") {
  return size === "icon" ? "h-3.5 w-3.5" : size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";
}

export function AppActions({ appId, size = "sm" }: { appId: string; size?: "sm" | "xs" | "icon" }) {
  const router = useRouter();

  if (size === "icon") {
    return (
      <div className="flex items-center gap-1">
        <button
          title="Check for new release"
          aria-label="Check for new release"
          className="focus-ring inline-flex items-center justify-center rounded-md border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] p-1.5 text-[var(--theme-text-muted)] hover:text-[var(--theme-accent)] hover:border-[var(--theme-accent-border)] transition-all active:scale-95"
          onClick={async () => {
            await post(`/api/apps/${appId}/check`);
            router.refresh();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button
          title="Mark current release as seen"
          aria-label="Mark current release as seen"
          className="focus-ring inline-flex items-center justify-center rounded-md border border-[var(--theme-line)] bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] p-1.5 text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:border-[color-mix(in_srgb,var(--theme-line)_140%,transparent)] transition-all active:scale-95"
          onClick={async () => {
            await post("/api/releases/seen", { watchedAppId: appId });
            router.refresh();
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className={`focus-ring inline-flex items-center font-medium bg-[var(--theme-accent-bg)] text-[var(--theme-accent)] border border-[var(--theme-accent-border)] hover:bg-[color-mix(in_srgb,var(--theme-accent)_18%,transparent)] transition-all duration-200 active:scale-95 ${buttonSizeClasses(size)}`}
        onClick={async () => {
          await post(`/api/apps/${appId}/check`);
          router.refresh();
        }}
      >
        <RefreshCw className={iconSizeClasses(size)} />
        Check
      </button>
      <button
        className={`focus-ring inline-flex items-center font-medium bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] text-[var(--theme-text-muted)] border border-[var(--theme-line)] hover:text-[var(--theme-text)] hover:border-[color-mix(in_srgb,var(--theme-line)_140%,transparent)] transition-all duration-200 active:scale-95 ${buttonSizeClasses(size)}`}
        onClick={async () => {
          await post("/api/releases/seen", { watchedAppId: appId });
          router.refresh();
        }}
      >
        <Check className={iconSizeClasses(size)} />
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
      <button
        className={`focus-ring inline-flex items-center font-medium bg-[var(--theme-status-failure-bg)] text-[var(--theme-status-failure)] border border-[var(--theme-status-failure-border)] hover:bg-[color-mix(in_srgb,var(--theme-status-failure)_22%,transparent)] transition-all duration-200 active:scale-95 ${buttonSizeClasses(size)}`}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className={iconSizeClasses(size)} />
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
        className={`focus-ring inline-flex items-center font-medium bg-[color-mix(in_srgb,var(--theme-surface-elevated)_50%,transparent)] text-[var(--theme-text-muted)] border border-[var(--theme-line)] hover:text-[var(--theme-text)] hover:border-[color-mix(in_srgb,var(--theme-line)_140%,transparent)] transition-all duration-200 active:scale-95 ${buttonSizeClasses(size)}`}
        onClick={() => setConfirmOpen(true)}
      >
        <BellOff className={iconSizeClasses(size)} />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, EyeOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/lib/toast";

/** Mark-seen and ignore actions for a single release page. */
export function ReleasePageActions({
  appId,
  releaseId,
  ignored,
  appName,
}: {
  appId: string;
  releaseId: string;
  ignored: boolean;
  appName: string;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmIgnore, setConfirmIgnore] = useState(false);

  async function markSeen() {
    setBusy(true);
    try {
      const res = await csrfFetch("/api/releases/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchedAppId: appId }),
      });
      if (!res.ok) throw new Error();
      addToast(`${appName} marked as seen`, "success");
      router.refresh();
    } catch {
      addToast("Could not mark as seen", "error");
    } finally {
      setBusy(false);
    }
  }

  async function ignore() {
    setBusy(true);
    try {
      const res = await csrfFetch("/api/releases/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      if (!res.ok) throw new Error();
      addToast("Release ignored", "success");
      setConfirmIgnore(false);
      router.refresh();
    } catch {
      addToast("Could not ignore this release", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={markSeen} disabled={busy} className="btn btn--primary btn--sm disabled:opacity-50">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Mark as seen
      </button>
      {!ignored && (
        <button
          type="button"
          onClick={() => setConfirmIgnore(true)}
          disabled={busy}
          className="btn btn--subtle btn--sm disabled:opacity-50"
        >
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          Ignore
        </button>
      )}
      <ConfirmDialog
        open={confirmIgnore}
        title="Ignore this release?"
        message="It stays in history but stops counting as an available update."
        confirmLabel="Ignore release"
        variant="danger"
        onCancel={() => setConfirmIgnore(false)}
        onConfirm={() => void ignore()}
      />
    </>
  );
}

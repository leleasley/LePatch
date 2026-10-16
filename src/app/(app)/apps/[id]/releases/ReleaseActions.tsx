"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { csrfFetch } from "@/lib/csrf-client";

export function IgnoreReleaseButton({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        className="focus-ring rounded-md border border-line px-3 py-1.5 text-xs hover:bg-white/5"
        onClick={() => setConfirmOpen(true)}
      >
        Ignore
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Ignore release"
        message="Are you sure you want to ignore this release? It will be hidden from the list."
        confirmLabel="Ignore"
        variant="default"
        onConfirm={async () => {
          await csrfFetch("/api/releases/ignore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ releaseId })
          });
          router.refresh();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

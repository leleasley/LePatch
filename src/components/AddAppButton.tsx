"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { AddAppModal } from "@/components/AddAppModal";

export function AddAppButton({
  watchedApps,
  canAdd,
}: {
  watchedApps: { id: string; repoFullName: string }[];
  canAdd: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn btn--primary btn--sm"
      >
        Add app <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
      <AddAppModal
        open={open}
        onClose={() => setOpen(false)}
        watchedApps={watchedApps}
        canAdd={canAdd}
      />
    </>
  );
}

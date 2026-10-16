"use client";

import { useEffect } from "react";
import { pendingAppNameStorageKey } from "@/lib/pending-navigation";

export function ClearPendingAppName() {
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(pendingAppNameStorageKey);
    } catch {
      // Ignore storage failures.
    }
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function TabRefresh() {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        // SWR already revalidates on focus; this is only a backstop for
        // server-rendered data, so throttle aggressively.
        if (now - lastRefresh.current > 60000) {
          lastRefresh.current = now;
          router.refresh();
        }
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [router]);

  return null;
}

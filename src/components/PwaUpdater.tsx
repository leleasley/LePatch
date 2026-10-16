"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/lib/toast";

export function PwaUpdater() {
  const { addToast } = useToast();
  const regRef = useRef<ServiceWorkerRegistration | null>(null);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        regRef.current = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });

        regRef.current.addEventListener("updatefound", () => {
          waitingWorkerRef.current = regRef.current!.installing;
          if (!waitingWorkerRef.current) return;

          waitingWorkerRef.current.addEventListener("statechange", () => {
            if (waitingWorkerRef.current?.state === "installed" && navigator.serviceWorker.controller) {
              const worker = waitingWorkerRef.current;
              addToast("A new version is available. Tap to refresh.", "info", () => {
                worker.postMessage({ type: "SKIP_WAITING" });
              });
            }
          });
        });
      } catch {
        // SW registration failed silently
      }
    };

    register();
  }, [addToast]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/toast";

const flashMessages = {
  "logged-in": { message: "You have logged in.", type: "success" as const },
  "logged-out": { message: "You have logged out.", type: "info" as const },
  "already-signed-in": { message: "You are already logged in.", type: "info" as const },
  "github-not-linked": { message: "No LePatch account is linked to this GitHub account.", type: "error" as const },
  "github-connected": { message: "GitHub account connected successfully.", type: "success" as const },
  "github-disconnected": { message: "GitHub account disconnected.", type: "info" as const },
  "github-already-linked": { message: "This GitHub account is already linked to another user.", type: "error" as const },
  "github-oauth-failed": { message: "GitHub OAuth authentication failed. Please try again.", type: "error" as const },
  "issue-tracked": { message: "Issue is now being tracked. You'll be notified of @mentions.", type: "success" as const },
  "issue-untracked": { message: "Issue tracking removed.", type: "info" as const },
  "issue-commented": { message: "Comment posted successfully.", type: "success" as const },
  "issue-closed": { message: "Issue closed.", type: "success" as const },
  "issue-reopened": { message: "Issue reopened.", type: "success" as const },
};

export function FlashToastBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    const flash = searchParams.get("toast");
    if (!flash) {
      handledRef.current = null;
      return;
    }

    const key = `${pathname}?toast=${flash}`;
    if (handledRef.current === key) return;
    handledRef.current = key;

    const config = flashMessages[flash as keyof typeof flashMessages];
    if (config) {
      addToast(config.message, config.type);
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("toast");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [addToast, pathname, router, searchParams]);

  return null;
}

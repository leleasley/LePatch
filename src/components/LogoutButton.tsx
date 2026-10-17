"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { cn } from "@/lib/cn";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await csrfFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even if the request fails, drop the user on the login screen; the
      // session cookie is cleared server-side on the next request.
    }
    window.location.href = "/login?toast=logged-out";
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      title="Log out"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50",
        !compact && "justify-start border border-border bg-surface-elevated"
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact && <span>{loading ? "Signing out…" : "Sign out"}</span>}
      {compact && <span className="sr-only">Sign out</span>}
    </button>
  );
}
"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await csrfFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    window.location.href = "/login?toast=logged-out";
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-line bg-white/5 px-3 py-2 text-sm text-text hover:bg-white/10 transition-colors disabled:opacity-50"
      title="Log out"
    >
      <LogOut className="h-4 w-4" />
      {!compact && (loading ? "Logging out..." : "Log out")}
    </button>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { Spinner } from "@/components/Spinner";
import { pendingAppNameStorageKey } from "@/lib/pending-navigation";

const pageNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/apps": "Apps",
  "/apps/search": "Search",
  "/apps/catalogue": "Catalogue",
  "/admin/settings": "Settings",
  "/profile": "Profile",
  "/profile/security": "Profile",
  "/profile/notifications": "Notifications",
  "/notifications": "Notifications",
  "/users": "Users",
};

function getPageName(pathname: string): string {
  if (pageNames[pathname]) return pageNames[pathname];
  if (pathname.startsWith("/apps/") && pathname.endsWith("/releases")) return "Releases";
  if (pathname.startsWith("/apps/")) return "App";
  return "Page";
}

export default function LoadingPage() {
  const pathname = usePathname();

  const defaultName = getPageName(pathname);
  let name = defaultName;
  if (pathname.startsWith("/apps/") && !pathname.endsWith("/releases")) {
    try {
      const pendingName = window.sessionStorage.getItem(pendingAppNameStorageKey);
      if (pendingName) name = pendingName;
    } catch {}
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-slate-400 animate-pulse">Loading {name}...</p>
      </div>
    </div>
  );
}

import type { AppsPayload } from "@/lib/use-swr";

export function updateWatchedApp(pages: AppsPayload[] | undefined, appId: string, changes: Partial<AppsPayload["apps"][number]>) {
  return pages?.map((page) => ({
    ...page,
    apps: page.apps.map((app) => app.id === appId ? { ...app, ...changes } : app),
  }));
}

export function removeWatchedApp(pages: AppsPayload[] | undefined, appId: string) {
  return pages?.map((page) => ({
    ...page,
    apps: page.apps.filter((app) => app.id !== appId),
    total: Math.max(0, page.total - 1),
  }));
}

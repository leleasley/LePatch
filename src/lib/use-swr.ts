"use client";

import useSWR, { SWRConfiguration, SWRResponse } from "swr";
import { csrfFetch } from "@/lib/csrf-client";

export const swrFetcher = async (url: string) => {
  const res = await csrfFetch(url);
  if (!res.ok) {
    const error = new Error("Failed to fetch");
    throw error;
  }
  return res.json();
};

export function useSWRData<T>(
  key: string | null,
  options?: SWRConfiguration<T>
): SWRResponse<T, Error> {
  return useSWR<T>(key, swrFetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 15000,
    refreshWhenHidden: false,
    ...options,
  });
}

export function useDashboard() {
  return useSWRData<{
    total: number;
    updates: number;
    failed: number;
    recent: Array<{
      id: string;
      tagName: string;
      name: string | null;
      htmlUrl: string;
      prerelease: boolean;
      publishedAt: Date | null;
      detectedAt: Date;
      watchedApp: {
        id: string;
        name: string;
        repoFullName: string;
        updateAvailable: boolean;
      };
    }>;
    lastCheckedAt: Date | null;
    pendingEvents: number;
    successCount: number;
    noReleasesCount: number;
    recentlyCheckedCount: number;
    releasesThisWeek: number;
    prereleasesThisWeek: number;
    activity: Array<{ date: string; label: string; count: number; prereleases: number }>;
    prereleases: Array<{
      id: string;
      tagName: string;
      name: string | null;
      htmlUrl: string;
      publishedAt: Date | null;
      detectedAt: Date;
      watchedApp: { id: string; name: string; repoFullName: string };
    }>;
    mostActive: Array<{ watchedAppId: string; name: string; repoFullName: string; releaseCount: number }>;
    notificationsDisabled: number;
    staleApps: number;
    attentionApps: Array<{
      id: string;
      name: string;
      repoOwner?: string;
      repoName?: string;
      repoFullName: string;
      latestSeenTag: string | null;
      lastCheckedAt: Date | null;
      checkStatus: string;
      checkError: string | null;
      updateAvailable: boolean;
      notificationsEnabled: boolean;
      includePrereleases: boolean;
      updatedAt: Date;
    }>;
    neverChecked: number;
    statusHealthy: boolean;
    lastCheckContext: string;
  }>("/api/dashboard", {
    refreshInterval: 60000,
  });
}

export function useApps() {
  return useSWRData<{
    apps: Array<{
      id: string;
      name: string;
      repoFullName: string;
      latestSeenTag: string | null;
      lastCheckedAt: string | null;
      checkStatus: string;
      updateAvailable: boolean;
      notificationsEnabled: boolean;
      includePrereleases: boolean;
    }>;
  }>("/api/apps", {
    refreshInterval: 60000,
  });
}

export function useNotifications() {
  return useSWRData<{
    events: Array<{
      id: string;
      status: string;
      createdAt: Date;
      sentAt: Date | null;
      error: string | null;
      release: {
        tagName: string;
        htmlUrl: string;
        watchedApp: {
          id: string;
          name: string;
          repoFullName: string;
        };
      };
      channel: {
        id: string;
        type: string;
        name: string;
      };
    }>;
    total: number;
    pending: number;
    failed: number;
    sent: number;
  }>("/api/notifications/events", {
    refreshInterval: 60000,
  });
}

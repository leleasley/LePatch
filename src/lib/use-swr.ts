"use client";

import useSWR, { SWRConfiguration, SWRResponse } from "swr";
import useSWRInfinite from "swr/infinite";
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
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 15000,
    refreshWhenHidden: false,
    ...options,
  });
}

export function useDashboard(initialData?: {
  total: number; updates: number; failed: number; stale: number;
  recent: Array<{ id: string; tagName: string; name: string | null; htmlUrl: string; prerelease: boolean; publishedAt: Date | string | null; detectedAt: Date | string; changelogSummary: string | null; watchedApp: { id: string; name: string; repoFullName: string } }>;
}) {
  return useSWRData<{
    total: number;
    updates: number;
    failed: number;
    stale: number;
    recent: Array<{
      id: string;
      tagName: string;
      name: string | null;
      htmlUrl: string;
      prerelease: boolean;
      publishedAt: Date | string | null;
      detectedAt: Date | string;
      changelogSummary: string | null;
      watchedApp: {
        id: string;
        name: string;
        repoFullName: string;
      };
    }>;
  }>("/api/dashboard", {
    fallbackData: initialData,
    refreshInterval: 60000,
  });
}

export type AppsPayload = {
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
    total: number;
    page: number;
    perPage: number;
};

export function useApps(initialData: AppsPayload) {
  return useSWRInfinite<AppsPayload>(
    (index, previous) => previous && previous.apps.length === 0 ? null : `/api/apps?page=${index + 1}&perPage=200`,
    swrFetcher,
    {
      fallbackData: [initialData],
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 60000,
      persistSize: true,
    }
  );
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

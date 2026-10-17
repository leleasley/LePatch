import { describe, expect, it } from "vitest";
import { removeWatchedApp, updateWatchedApp } from "@/lib/apps-ui-state";
import type { AppsPayload } from "@/lib/use-swr";

const initial: AppsPayload[] = [{
  page: 1,
  perPage: 200,
  total: 2,
  apps: [
    { id: "alpha", name: "Alpha", repoFullName: "acme/alpha", latestSeenTag: "v2", lastCheckedAt: null, checkStatus: "success", updateAvailable: true, notificationsEnabled: true, includePrereleases: false },
    { id: "beta", name: "Beta", repoFullName: "acme/beta", latestSeenTag: "v1", lastCheckedAt: null, checkStatus: "success", updateAvailable: false, notificationsEnabled: true, includePrereleases: false },
  ],
}];

describe("watched app UI cache transitions", () => {
  it("removes a row immediately and restores the exact view on rollback", () => {
    const visibleAfterRemove = removeWatchedApp(initial, "alpha");
    expect(visibleAfterRemove?.[0].apps.map((app) => app.id)).toEqual(["beta"]);
    expect(visibleAfterRemove?.[0].total).toBe(1);

    // SWR rollback uses the immutable pre-mutation snapshot.
    expect(initial[0].apps.map((app) => app.id)).toEqual(["alpha", "beta"]);
    expect(visibleAfterRemove).not.toBe(initial);
  });

  it("updates mute state optimistically and preserves the old view for rollback", () => {
    const visibleAfterMute = updateWatchedApp(initial, "alpha", { notificationsEnabled: false });
    expect(visibleAfterMute?.[0].apps[0].notificationsEnabled).toBe(false);
    expect(initial[0].apps[0].notificationsEnabled).toBe(true);
  });

  it("acknowledges the latest release immediately in the visible update state", () => {
    const visibleAfterAcknowledge = updateWatchedApp(initial, "alpha", { updateAvailable: false });
    expect(visibleAfterAcknowledge?.[0].apps[0].updateAvailable).toBe(false);
    expect(visibleAfterAcknowledge?.[0].apps[0].latestSeenTag).toBe("v2");
    expect(initial[0].apps[0].updateAvailable).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isInQuietHours, msUntilQuietHoursEnd, msUntilDigestWindow } from "@/lib/notifications";

const prefs = {
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  timezone: "UTC",
};

describe("isInQuietHours", () => {
  it("is false when no window is configured", () => {
    expect(isInQuietHours({ quietHoursStart: null, quietHoursEnd: null, timezone: "UTC" })).toBe(false);
  });

  it("handles a window that wraps midnight", () => {
    expect(isInQuietHours(prefs, new Date("2026-01-01T23:30:00Z"))).toBe(true);
    expect(isInQuietHours(prefs, new Date("2026-01-01T03:00:00Z"))).toBe(true);
    expect(isInQuietHours(prefs, new Date("2026-01-01T12:00:00Z"))).toBe(false);
  });

  it("handles a same-day window", () => {
    const day = { quietHoursStart: "09:00", quietHoursEnd: "17:00", timezone: "UTC" };
    expect(isInQuietHours(day, new Date("2026-01-01T12:00:00Z"))).toBe(true);
    expect(isInQuietHours(day, new Date("2026-01-01T08:00:00Z"))).toBe(false);
  });

  it("respects the user's timezone", () => {
    const tokyo = { ...prefs, timezone: "Asia/Tokyo" };
    // 23:30 UTC is 08:30 the next day in Tokyo — outside 22:00-07:00.
    expect(isInQuietHours(tokyo, new Date("2026-01-01T23:30:00Z"))).toBe(false);
    // 14:00 UTC is 23:00 in Tokyo — inside the window.
    expect(isInQuietHours(tokyo, new Date("2026-01-01T14:00:00Z"))).toBe(true);
  });
});

describe("msUntilQuietHoursEnd", () => {
  it("returns 0 outside the window", () => {
    expect(msUntilQuietHoursEnd(prefs, new Date("2026-01-01T12:00:00Z"))).toBe(0);
  });

  it("returns a positive delay inside the window", () => {
    const delay = msUntilQuietHoursEnd(prefs, new Date("2026-01-01T23:30:00Z"));
    // 23:30 -> 07:00 next day is 7.5 hours.
    expect(delay).toBe(7.5 * 60 * 60 * 1000);
  });

  it("treats an empty window as disabled rather than always quiet", () => {
    const empty = { quietHoursStart: "00:00", quietHoursEnd: "00:00", timezone: "UTC" };
    expect(msUntilQuietHoursEnd(empty, new Date("2026-01-01T12:00:00Z"))).toBe(0);
  });

  it("never defers by more than one day", () => {
    const almostAllDay = { quietHoursStart: "01:00", quietHoursEnd: "23:59", timezone: "UTC" };
    const delay = msUntilQuietHoursEnd(almostAllDay, new Date("2026-01-01T12:00:00Z"));
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

describe("msUntilDigestWindow", () => {
  it("returns 0 when no digest is configured", () => {
    expect(msUntilDigestWindow({ digestInterval: null }, new Date())).toBe(0);
    expect(msUntilDigestWindow({}, new Date())).toBe(0);
  });

  it("always defers by less than one window", () => {
    const from = new Date("2026-01-01T12:34:56Z");
    for (const id of ["a", "b", "c", "user-1234"]) {
      const delay = msUntilDigestWindow({ digestInterval: 60, id }, from);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(60 * 60 * 1000);
    }
  });

  it("spreads different users across the window", () => {
    const from = new Date("2026-01-01T12:00:00Z");
    const a = msUntilDigestWindow({ digestInterval: 60, id: "alice" }, from);
    const b = msUntilDigestWindow({ digestInterval: 60, id: "bob" }, from);
    expect(a).not.toBe(b);
  });

  it("is deterministic for the same user", () => {
    const from = new Date("2026-01-01T12:00:00Z");
    expect(msUntilDigestWindow({ digestInterval: 60, id: "alice" }, from)).toBe(
      msUntilDigestWindow({ digestInterval: 60, id: "alice" }, from)
    );
  });
});
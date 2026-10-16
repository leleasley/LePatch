import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_NOT_FOUND_MESSAGE,
  GITHUB_TOKEN_EXPIRED_MESSAGE,
  fetchRepoWithAccess,
  isNotFoundError,
  isPossiblyPrivateError,
  isTokenExpiredError,
} from "@/lib/github";
import { userSnapshotKey } from "@/lib/repo-snapshot";

describe("private repo access helpers", () => {
  it("classifies 404s as not-found", () => {
    expect(isNotFoundError(new Error(GITHUB_NOT_FOUND_MESSAGE))).toBe(true);
    expect(isNotFoundError(new Error("GitHub request failed with status 500"))).toBe(false);
    expect(isNotFoundError("Repository or release not found")).toBe(false);
  });

  it("classifies expired/revoked tokens", () => {
    expect(isTokenExpiredError(new Error(GITHUB_TOKEN_EXPIRED_MESSAGE))).toBe(true);
    expect(isTokenExpiredError(new Error("GitHub request failed with status 401"))).toBe(true);
    expect(isTokenExpiredError(new Error(GITHUB_NOT_FOUND_MESSAGE))).toBe(false);
  });

  it("keeps private snapshots under per-user keys", () => {
    const a = userSnapshotKey("user-1", "debridmediamanager", "zurg");
    const b = userSnapshotKey("user-2", "debridmediamanager", "zurg");
    expect(a).toContain("debridmediamanager/zurg");
    expect(a).toContain("user-1");
    expect(a).not.toBe(b);
  });

  it("retries 404s and search-API 422s with the viewer token", async () => {
    const seen: Array<string | undefined> = [];
    const loader = vi.fn(async (token?: string) => {
      seen.push(token);
      if (token === undefined) throw new Error(GITHUB_NOT_FOUND_MESSAGE);
      return "private-data";
    });
    const result = await fetchRepoWithAccess("user-1", loader, async () => "user-token");
    expect(result).toBe("private-data");
    expect(seen).toEqual([undefined, "user-token"]);

    const loader422 = vi.fn(async (token?: string) => {
      if (token === undefined) throw new Error("GitHub request failed with status 422");
      return "private-data";
    });
    await expect(fetchRepoWithAccess("user-1", loader422, async () => "user-token")).resolves.toBe("private-data");
  });

  it("rethrows when there is no viewer or no token", async () => {
    const boom = new Error(GITHUB_NOT_FOUND_MESSAGE);
    await expect(fetchRepoWithAccess(null, async () => {
      throw boom;
    })).rejects.toBe(boom);
    await expect(fetchRepoWithAccess("user-1", async () => {
      throw boom;
    }, async () => null)).rejects.toBe(boom);
  });

  it("does not retry non-access errors", async () => {
    const boom = new Error("GitHub rate limit exceeded");
    const loader = vi.fn(async () => {
      throw boom;
    });
    await expect(fetchRepoWithAccess("user-1", loader, async () => "user-token")).rejects.toBe(boom);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(isPossiblyPrivateError(boom)).toBe(false);
  });
});

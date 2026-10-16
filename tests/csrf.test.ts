import { describe, expect, it, vi } from "vitest";
import { generateCsrfToken, validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";

vi.mock("@/lib/env", () => ({
  env: { trustProxy: false, appUrl: "http://localhost:3000" },
}));

describe("generateCsrfToken", () => {
  it("generates a 64-character hex string", () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it("generates unique tokens on each call", () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).not.toBe(t2);
  });
});

describe("validateCsrf", () => {
  it("returns true for GET requests without validation", () => {
    const req = new Request("http://localhost/api/test", { method: "GET" });
    expect(validateCsrf(req)).toBe(true);
  });

  it("returns true for HEAD requests", () => {
    const req = new Request("http://localhost/api/test", { method: "HEAD" });
    expect(validateCsrf(req)).toBe(true);
  });

  it("returns true for OPTIONS requests", () => {
    const req = new Request("http://localhost/api/test", { method: "OPTIONS" });
    expect(validateCsrf(req)).toBe(true);
  });

  it("returns false for POST without CSRF cookie", () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "X-CSRF-Token": "some-token" },
    });
    expect(validateCsrf(req)).toBe(false);
  });

  it("returns false for POST without CSRF header", () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { cookie: "lepatch_csrf=some-token" },
    });
    expect(validateCsrf(req)).toBe(false);
  });

  it("returns false when cookie and header do not match", () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        cookie: "lepatch_csrf=valid-token",
        "X-CSRF-Token": "different-token",
      },
    });
    expect(validateCsrf(req)).toBe(false);
  });

  it("returns true when cookie and header match", () => {
    const token = generateCsrfToken();
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        cookie: `lepatch_csrf=${token}`,
        "X-CSRF-Token": token,
      },
    });
    expect(validateCsrf(req)).toBe(true);
  });
});

describe("rejectedCsrfResponse", () => {
  it("returns 403 with error message", async () => {
    const res = rejectedCsrfResponse();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Invalid CSRF token");
  });
});

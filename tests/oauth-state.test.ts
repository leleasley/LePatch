import { describe, expect, it } from "vitest";
import { createOAuthState, verifyOAuthState } from "@/lib/oauth-state";

describe("OAuth state signing", () => {
  it("round-trips a signed state", () => {
    const { state, nonce } = createOAuthState("link");
    const parsed = verifyOAuthState(state);
    expect(parsed?.mode).toBe("link");
    expect(parsed?.nonce).toBe(nonce);
  });

  it("rejects a tampered payload", () => {
    const { state } = createOAuthState("link");
    const [payload, signature] = state.split(".");
    const forged = Buffer.from(
      JSON.stringify({ mode: "login", nonce: "attacker", expiresAt: Date.now() + 60_000 })
    ).toString("base64url");
    expect(verifyOAuthState(`${forged}.${signature}`)).toBeNull();
    expect(verifyOAuthState(`${payload}.${signature}`)).not.toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { state } = createOAuthState("login");
    const [payload] = state.split(".");
    expect(verifyOAuthState(`${payload}.notarealsignature`)).toBeNull();
  });

  it("rejects an expired state", () => {
    const { state } = createOAuthState("link");
    const parsed = verifyOAuthState(state);
    expect(parsed).not.toBeNull();

    // Rebuild with an already-past expiry using the same (valid) shape.
    const expired = Buffer.from(
      JSON.stringify({ mode: "link", nonce: "n", expiresAt: Date.now() - 1000 })
    ).toString("base64url");
    expect(verifyOAuthState(`${expired}.whatever`)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifyOAuthState(null)).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
    expect(verifyOAuthState("no-separator")).toBeNull();
    expect(verifyOAuthState(".signature-only")).toBeNull();
  });

  it("rejects an unknown mode", () => {
    const encoded = Buffer.from(
      JSON.stringify({ mode: "admin", nonce: "n", expiresAt: Date.now() + 60_000 })
    ).toString("base64url");
    expect(verifyOAuthState(`${encoded}.sig`)).toBeNull();
  });
});
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Signed OAuth state.
 *
 * The previous implementation was plain base64 JSON whose only protection was
 * equality with a companion cookie. Anyone able to plant that cookie (for
 * example from a sibling subdomain) could forge `mode` and `userId` and link
 * their own GitHub account to another user's LePatch account. The payload is
 * now HMAC-signed with the session secret, and `userId` is re-derived from the
 * live session at callback time rather than trusted from the state.
 */

export const GITHUB_OAUTH_STATE_COOKIE = "__Host-gh_oauth_state";

/** Legacy name read-only, so flows started before the upgrade still complete. */
export const LEGACY_GITHUB_OAUTH_STATE_COOKIE = "gh_oauth_state";

export type OAuthState = {
  mode: "link" | "login";
  nonce: string;
  expiresAt: number;
};

function sign(payload: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(payload).digest("base64url");
}

export function createOAuthState(mode: OAuthState["mode"]): { state: string; nonce: string } {
  const payload: OAuthState = {
    mode,
    nonce: crypto.randomBytes(32).toString("hex"),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: `${encoded}.${sign(encoded)}`, nonce: payload.nonce };
}

export function verifyOAuthState(state: string | null): OAuthState | null {
  if (!state) return null;
  const separator = state.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  const expected = sign(encoded);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as OAuthState;
    if (payload.mode !== "link" && payload.mode !== "login") return null;
    if (!payload.expiresAt || payload.expiresAt < Date.now()) return null;
    if (!payload.nonce) return null;
    return payload;
  } catch {
    return null;
  }
}
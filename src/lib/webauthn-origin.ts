import { env } from "@/lib/env";

/**
 * WebAuthn relying-party values.
 *
 * These MUST come from server-side configuration. Deriving them from
 * `X-Forwarded-Host` lets a caller choose the origin their credential is
 * validated against, which defeats the origin binding that makes passkeys safe.
 */

function appOrigins(): string[] {
  const configured = [env.appUrl, ...(process.env.WEB_AUTHN_EXTRA_ORIGINS || "").split(",")]
    .map((value) => value.trim())
    .filter(Boolean);

  const origins = new Set<string>();
  for (const value of configured) {
    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      origins.add(url.origin);
    } catch {
      // Ignore malformed entries rather than crashing every passkey request.
    }
  }
  return [...origins];
}

const origins = appOrigins();

if (origins.length === 0) {
  throw new Error("APP_URL must be set to a valid absolute URL for WebAuthn to work");
}

/** The first (canonical) origin, used as the default RP ID. */
export const webauthnOrigin = origins[0];

/** Every origin a passkey ceremony is allowed to run against. */
export const webauthnAllowedOrigins = origins;

/** Relying-party ID: the registrable domain of the canonical origin. */
export function webauthnRpId(request?: Request): string {
  const headerHost = request?.headers.get("x-forwarded-host")?.split(":")[0];
  // Only accept a host that matches a configured origin, so a LAN alias still
  // works when explicitly allow-listed but arbitrary hosts do not.
  if (headerHost && origins.some((origin) => new URL(origin).hostname === headerHost)) {
    return headerHost;
  }
  return new URL(webauthnOrigin).hostname;
}
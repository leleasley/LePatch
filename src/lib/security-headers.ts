import type { NextResponse } from "next/server";

type SecurityHeaderOptions = {
  isHttps: boolean;
  nonce?: string;
  includeNoStore?: boolean;
};

export function setSecurityHeaders(
  response: NextResponse,
  { isHttps, nonce, includeNoStore = true }: SecurityHeaderOptions
) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "0");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), usb=()");
  response.headers.set("Pragma", "no-cache");
  response.headers.delete("Server");
  response.headers.delete("X-Powered-By");

  if (includeNoStore) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }

  if (isHttps) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      nonce
        ? `script-src 'self' 'nonce-${nonce}'`
        : "script-src 'self'",
      nonce
        ? `style-src 'self' 'nonce-${nonce}'`
        : "style-src 'self'",
      "script-src-attr 'none'",
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ")
  );
}

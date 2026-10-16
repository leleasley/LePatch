"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/cn";

/**
 * Renders an otpauth:// URL as a QR code entirely in the browser.
 *
 * The previous implementation used api.qrserver.com, which sent every user's MFA
 * seed and email address to a third party. This keeps the secret local.
 */
export function QrCode({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!value) return;

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0d1117", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div className={cn("flex items-center justify-center rounded-lg border border-border bg-surface p-4 text-center text-xs text-text-muted", className)} style={{ width: size, height: size }}>
        Enter the secret key manually instead.
      </div>
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-border bg-white", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {dataUrl && <img src={dataUrl} alt="" width={size} height={size} className="h-full w-full" />}
    </div>
  );
}
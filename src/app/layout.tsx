import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/lib/toast";
import { FlashToastBridge } from "@/components/FlashToastBridge";
import { PwaUpdater } from "@/components/PwaUpdater";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    template: "%s | LePatch",
    default: "LePatch",
  },
  description: "Self-hosted release monitoring and update notifications",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/lepatch-mark.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/icons/lepatch-mark.svg", color: "#b5ea73" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LePatch",
  },
  openGraph: {
    title: "LePatch",
    description: "Self-hosted release monitoring and update notifications",
    type: "website",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "LePatch GitHub release dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/social-preview.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111712",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#111712" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-startup-image" href="/icons/splash-1170x2532-dark.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: dark)" />
        <link rel="apple-touch-startup-image" href="/icons/splash-1170x2532-light.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: light)" />
        <link rel="apple-touch-startup-image" href="/icons/splash-750x1334-dark.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (prefers-color-scheme: dark)" />
        <link rel="apple-touch-startup-image" href="/icons/splash-750x1334-light.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (prefers-color-scheme: light)" />
        <link rel="apple-touch-startup-image" href="/icons/splash-1290x2796-dark.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: dark)" />
        <link rel="apple-touch-startup-image" href="/icons/splash-1290x2796-light.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (prefers-color-scheme: light)" />
      </head>
      <body className={`antialiased ${inter.className}`}>
        <ThemeProvider initialTheme="dark">
          <ToastProvider>
            <Suspense fallback={null}>
              <FlashToastBridge />
            </Suspense>
            {children}
            <PwaUpdater />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/lib/toast";
import { FlashToastBridge } from "@/components/FlashToastBridge";
import { PwaUpdater } from "@/components/PwaUpdater";
import { TabRefresh } from "@/components/TabRefresh";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    template: "%s | LePatch",
    default: "LePatch",
  },
  description: "Self-hosted release monitoring and update notifications",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/assets/Logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/assets/Logo.png", color: "#06b6d4" },
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
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#050b14",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#050b14" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" as="image" href="/assets/dark_desktop_background.png" media="(min-width: 640px) and (prefers-color-scheme: dark)" />
        <link rel="preload" as="image" href="/assets/dark_mobile_background.png" media="(max-width: 639px) and (prefers-color-scheme: dark)" />
      </head>
      <body className={`antialiased ${inter.className}`}>
        <ThemeProvider initialTheme="dark">
          <ToastProvider>
            <Suspense fallback={null}>
              <FlashToastBridge />
            </Suspense>
            {children}
            <TabRefresh />
            <PwaUpdater />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

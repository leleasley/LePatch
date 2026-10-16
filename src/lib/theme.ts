/**
 * Theme system.
 *
 * LePatch ships two designed themes plus "system". The previous version
 * carried ten: eight of them never defined the status, divider, shadow or
 * background-image tokens, so status pills silently collapsed to plain text
 * and shadows vanished. A small set that is actually designed beats a large set
 * that is half broken.
 *
 * Colour values live in `src/app/globals.css` (single source of truth).
 * `themeList` here only carries the metadata the UI needs.
 */

export type ThemeId = "dark" | "light" | "system";

export const themeList: { id: ThemeId; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function isValidTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && (["dark", "light", "system"] as string[]).includes(value);
}

/** Resolve "system" against the user's OS preference. */
export function resolveTheme(id: ThemeId): "dark" | "light" {
  if (id !== "system") return id;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Browser chrome colour, kept in sync with the CSS canvas token. */
export const themeColor: Record<"dark" | "light", string> = {
  dark: "#0d1117",
  light: "#ffffff",
};
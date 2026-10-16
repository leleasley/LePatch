"use client";

import { createContext, useContext, useEffect, useState, useCallback, startTransition } from "react";
import type { ThemeId } from "@/lib/theme";
import { resolveTheme, themeColor } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: ThemeId;
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme);

  const applyTheme = useCallback((id: ThemeId) => {
    const resolved = resolveTheme(id);
    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColor[resolved]);
  }, []);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      applyTheme(id);
      try {
        localStorage.setItem("lepatch-theme", id);
      } catch {
        // Private mode: the choice simply does not persist.
      }
    },
    [applyTheme]
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Follow the OS while "system" is selected.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme, applyTheme]);

  useEffect(() => {
    let stored: ThemeId | null = null;
    try {
      stored = localStorage.getItem("lepatch-theme") as ThemeId | null;
    } catch {
      stored = null;
    }
    if (stored && stored !== theme) {
      startTransition(() => setThemeState(stored));
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
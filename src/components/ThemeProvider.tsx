"use client";

import { createContext, useContext, useEffect, useState, useCallback, startTransition } from "react";
import type { ThemeId } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
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
    document.documentElement.setAttribute("data-theme", id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const colors: Record<ThemeId, string> = {
        dark: "#050b14",
        light: "#f1f5f9",
        ocean: "#0a1628",
        forest: "#0a1a0f",
        sunset: "#1a0f0a",
        nord: "#2e3440",
        graphite: "#111315",
        rose: "#160d14",
        matcha: "#12170f",
        midnight: "#070713",
      };
      meta.setAttribute("content", colors[id] || colors.dark);
    }
  }, []);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      applyTheme(id);
      try {
        localStorage.setItem("lepatch-theme", id);
      } catch {}
    },
    [applyTheme]
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  useEffect(() => {
    const stored = localStorage.getItem("lepatch-theme") as ThemeId | null;
    if (stored && stored !== theme) {
      startTransition(() => setTheme(stored));
    }
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

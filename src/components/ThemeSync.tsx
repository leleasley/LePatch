"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import type { ThemeId } from "@/lib/theme";

export function ThemeSync({ userTheme }: { userTheme: ThemeId }) {
  const { setTheme } = useTheme();
  const previousUserTheme = useRef<ThemeId | null>(null);

  useEffect(() => {
    if (!userTheme) return;
    if (previousUserTheme.current === userTheme) return;
    previousUserTheme.current = userTheme;
    setTheme(userTheme);
  }, [userTheme, setTheme]);

  return null;
}

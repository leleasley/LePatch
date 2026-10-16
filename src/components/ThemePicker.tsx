"use client";

import { useState, useRef, useEffect } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useTheme } from "@/components/ThemeProvider";
import { themeList } from "@/lib/theme";
import type { ThemeId } from "@/lib/theme";
import { cn } from "@/lib/cn";

const icons: Record<ThemeId, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemePicker({ initialTheme }: { initialTheme: ThemeId }) {
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const currentTheme = theme || initialTheme;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function persistTheme(newTheme: ThemeId) {
    const previousTheme = currentTheme;
    setTheme(newTheme);
    setSaving(true);
    setMessage("");
    try {
      const res = await csrfFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
      if (res.ok) {
        setMessage("Appearance saved");
      } else {
        setTheme(previousTheme);
        setMessage("Could not save appearance");
      }
    } catch {
      setTheme(previousTheme);
      setMessage("Could not save appearance");
    } finally {
      setSaving(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMessage(""), 2500);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface-elevated">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text">Appearance</h2>
        <p className="mt-0.5 text-sm text-text-muted">Light and dark are both designed, not inverted.</p>
      </header>

      <div className="p-4">
        <div role="radiogroup" aria-label="Colour theme" className="grid gap-2 sm:grid-cols-3">
          {themeList.map((option) => {
            const Icon = icons[option.id];
            const active = currentTheme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={saving}
                onClick={() => persistTheme(option.id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-text"
                    : "border-border bg-surface text-text-muted hover:border-accent/50 hover:text-text"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-text-faint")} />
                <span className="flex-1 text-left font-medium">{option.label}</span>
                {active && <Check className="h-4 w-4 text-accent" />}
              </button>
            );
          })}
        </div>

        <p aria-live="polite" className="mt-3 min-h-5 text-xs text-text-muted">
          {message}
        </p>
      </div>
    </section>
  );
}
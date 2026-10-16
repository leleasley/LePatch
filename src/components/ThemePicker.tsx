"use client";

import { useState, useRef, useEffect } from "react";
import { Palette, Loader2, MoonStar, SunMedium } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { useTheme } from "@/components/ThemeProvider";
import { themeList } from "@/lib/theme";
import type { ThemeId } from "@/lib/theme";

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
        setMessage("Theme saved");
      } else {
        setTheme(previousTheme);
        setMessage("Failed to save theme");
      }
    } catch {
      setTheme(previousTheme);
      setMessage("Failed to save theme");
    } finally {
      setSaving(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setMessage(""), 2000);
    }
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await persistTheme(e.target.value as ThemeId);
  }

  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-[var(--theme-accent-bg)] p-2.5">
          <Palette className="h-5 w-5 text-[var(--theme-accent)]" />
        </div>
        <div>
          <h2 className="text-lg font-medium">Appearance</h2>
          <p className="text-sm text-[var(--theme-text-muted)]">Choose a mode quickly, then fine-tune with the full palette.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { id: "dark" as ThemeId, label: "Dark mode", description: "Use the dark artwork and darker panels.", icon: MoonStar },
              { id: "light" as ThemeId, label: "Light mode", description: "Use the light artwork and brighter panels.", icon: SunMedium },
            ].map((option) => {
              const Icon = option.icon;
              const active = currentTheme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={saving}
                  onClick={() => persistTheme(option.id)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    active
                      ? "border-[var(--theme-accent-border)] bg-[var(--theme-accent-bg)] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
                      : "border-line bg-surface hover:border-[var(--theme-accent-border)]"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-white/5 p-2">
                      <Icon className="h-4 w-4 text-[var(--theme-accent)]" />
                    </div>
                    <div>
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-[var(--theme-text-muted)]">{option.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-[var(--theme-text-muted)]">Full theme palette</label>
            <select
              value={currentTheme}
              onChange={handleChange}
              disabled={saving}
              className="focus-ring rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-all disabled:opacity-50"
            >
              {themeList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start lg:self-end">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-[var(--theme-text-muted)]" />}
          {message && (
            <span className="text-xs text-emerald-400">{message}</span>
          )}
        </div>
      </div>
    </section>
  );
}

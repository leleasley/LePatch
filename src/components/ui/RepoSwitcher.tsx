"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type AppSummary = { id: string; name: string; repoFullName: string };

/**
 * Repository switcher.
 *
 * A combobox over the user's watched repositories: type to filter, arrow keys to
 * move, Enter to open. Watched-app data is fetched once on first open.
 */
export function RepoSwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/apps?perPage=100")
      .then((res) => (res.ok ? res.json() : { apps: [] }))
      .then((data) => {
        if (!cancelled) setApps(data.apps ?? []);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps.slice(0, 20);
    return apps
      .filter((app) => `${app.name} ${app.repoFullName}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [apps, query]);

  function choose(app: AppSummary | undefined) {
    if (!app) return;
    setOpen(false);
    router.push(`/apps/${app.id}`);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
          setActive(0);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch repository"
        className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">Switch repository</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-md">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, results.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  choose(results[active]);
                }
              }}
              placeholder="Filter repositories"
              aria-label="Filter repositories"
              className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none placeholder:text-text-faint focus:border-accent"
            />
          </div>
          <ul role="listbox" aria-label="Watched repositories" className="max-h-72 overflow-y-auto p-1">
            {!loaded && <li className="px-3 py-4 text-center text-xs text-text-faint">Loading…</li>}
            {loaded && results.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-text-faint">No repositories matched</li>
            )}
            {results.map((app, index) => (
              <li key={app.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(app)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left",
                    index === active ? "bg-accent/10" : "hover:bg-surface"
                  )}
                >
                  <span className="text-xs font-medium text-text">{app.name}</span>
                  <span className="mono text-2xs text-text-faint">{app.repoFullName}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
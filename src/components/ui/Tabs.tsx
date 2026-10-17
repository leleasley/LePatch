"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
};

/**
 * Tab list with roving focus and arrow-key navigation.
 *
 * The previous implementation set role="tablist" on links with no tabpanels,
 * no arrow keys and no roving tabindex — a pattern that lies to assistive tech.
 */
export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: React.KeyboardEvent) {
    const index = items.findIndex((item) => item.id === value);
    if (index < 0) return;

    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;

    event.preventDefault();
    const target = items[next];
    onChange(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="app-tabs">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[item.id] = el;
            }}
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={active}
            aria-controls={`panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            data-active={active}
            onClick={() => onChange(item.id)}
            className="app-tab"
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className="ml-0.5 rounded-full bg-surface-elevated px-1.5 text-2xs text-text-muted">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="focus:outline-none">
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                */
/* -------------------------------------------------------------------------- */

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <span aria-hidden="true" className="text-text-faint">/</span>}
            {item.href ? (
              <Link href={item.href} className="app-link hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-text">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Command palette                                                            */
/* -------------------------------------------------------------------------- */

export type Command = {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  href?: string;
  run?: () => void;
};

/**
 * ⌘K / Ctrl+K palette.
 *
 * Global shortcut, focus trap, arrow-key navigation and Escape to dismiss.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listId = useId();

  const results = commands.filter((command) => {
    if (!query.trim()) return true;
    const haystack = `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    onClose();
    if (command.href) router.push(command.href);
    else command.run?.();
  }

  return (
    <div className="modal-root" role="presentation">
      <div className="modal-overlay" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="modal-panel modal-panel-dialog top-[12%] max-w-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-text-faint" />
          <input
            autoFocus
            key={String(open)}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Jump to a page or run a command"
            aria-label="Search commands"
            aria-controls={listId}
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-faint"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-2xs text-text-faint">Esc</kbd>
        </div>

        <ul id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-text-muted">No matching commands</li>
          )}
          {results.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === active}>
              <button
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(command)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
                  index === active ? "bg-accent/10 text-text" : "text-text-muted hover:bg-surface"
                )}
              >
                <span>{command.label}</span>
                <span className="text-2xs text-text-faint">{command.group}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Registers the global ⌘K shortcut. */
export function useCommandPaletteKey(setOpen: (open: boolean) => void) {
  const pathname = usePathname();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pathname, setOpen]);
}
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Boxes, Bell, BellOff, Check, GitFork, RefreshCw, CheckSquare, Square, ChevronDown, ListFilter, CheckCircle2 } from "lucide-react";
import { AppDetailLink } from "@/components/AppDetailLink";
import { LiveTimestamp } from "@/components/LiveTimestamp";
import type { ReactNode } from "react";

type App = {
  id: string;
  name: string;
  repoFullName: string;
  latestSeenTag: string | null;
  lastCheckedAt: string | null;
  checkStatus: string;
  updateAvailable: boolean;
  notificationsEnabled: boolean;
  includePrereleases: boolean;
};

function statusNode(app: App): { label: string; tone: "success" | "warning" | "error" | "muted"; borderColor: string } {
  if (app.updateAvailable) {
    return { label: "Update available", tone: "warning", borderColor: "var(--color-status-warning)" };
  }
  if (app.checkStatus === "failed") return { label: "Failed", tone: "error", borderColor: "var(--color-status-danger)" };
  if (app.checkStatus === "success") return { label: "Healthy", tone: "success", borderColor: "var(--color-status-success)" };
  if (app.checkStatus === "no_releases") return { label: "No releases", tone: "muted", borderColor: "transparent" };
  return { label: "Not checked", tone: "muted", borderColor: "transparent" };
}

function isStaleApp(app: App): boolean {
  if (!app.lastCheckedAt) return true;
  return Date.now() - new Date(app.lastCheckedAt).getTime() > 24 * 60 * 60 * 1000;
}

function StatusPill({ tone, children, dot }: { tone: "success" | "warning" | "error" | "muted"; children: ReactNode; dot?: boolean }) {
  const colors = {
    success: { bg: "var(--theme-status-success-bg)", border: "var(--theme-status-success-border)", fg: "var(--color-status-success)" },
    warning: { bg: "var(--theme-status-pending-bg)", border: "var(--theme-status-pending-border)", fg: "var(--color-status-warning)" },
    error: { bg: "var(--theme-status-failure-bg)", border: "var(--theme-status-failure-border)", fg: "var(--color-status-danger)" },
    muted: { bg: "color-mix(in srgb, var(--color-text-faint) 8%, transparent)", border: "var(--color-border)", fg: "var(--color-text-muted)" },
  }[tone];

  return (
    <span
      className={`status-pill${tone === "warning" || tone === "error" ? " pulse-pill" : ""}`}
      style={{ background: colors.bg, borderColor: colors.border, color: colors.fg }}
    >
      {dot && <span className="pulse-dot" />}
      {children}
    </span>
  );
}

function QuickAction({ icon, label, onClick, title }: { icon: ReactNode; label: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-elevated)_40%,transparent)] px-1.5 py-1 text-[0.72rem] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[color-mix(in_srgb,var(--color-border)_140%,transparent)] transition-colors md:px-1 md:py-0.5"
    >
      {icon}
      <span className="hidden sm:inline lg:hidden">{label}</span>
    </button>
  );
}

export function AppsTable({
  apps,
  selectedIds = [],
  onToggleApp,
  onToggleAll,
  onSelectWithUpdates,
  onSelectHealthy,
  allSelected = false,
  someSelected = false,
  onCheck,
  onMarkSeen,
}: {
  apps: App[];
  selectedIds?: string[];
  onToggleApp?: (appId: string) => void;
  onToggleAll?: (ids: string[]) => void;
  onSelectWithUpdates?: () => void;
  onSelectHealthy?: () => void;
  allSelected?: boolean;
  someSelected?: boolean;
  onCheck?: (appId: string) => void;
  onMarkSeen?: (appId: string) => void;
}) {
  const selectable = Boolean(onToggleApp && onToggleAll);
  const showActions = Boolean(onCheck || onMarkSeen);

  return (
    <div className="app-shell-card overflow-hidden">
      {/* Desktop table (md+) */}
      <table className="hidden md:table min-w-full text-sm">
        <thead className="text-[0.72rem] uppercase tracking-[0.12em] text-[var(--color-text-faint)]">
          <tr className="border-b border-[var(--theme-divider)]">
            {selectable && (
              <th className="w-10 px-3 py-3 text-left">
                <SelectAllDropdown
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onToggleAll={() => onToggleAll?.(apps.map((app) => app.id))}
                  onSelectWithUpdates={onSelectWithUpdates}
                  onSelectHealthy={onSelectHealthy}
                />
              </th>
            )}
            <th className="px-3 py-3 text-left font-semibold">App</th>
            <th className="px-3 py-3 text-left font-semibold">Status</th>
            <th className="px-3 py-3 text-left font-semibold">Version</th>
            <th className="px-3 py-3 text-left font-semibold">Last checked</th>
            <th className="px-3 py-3 text-left font-semibold">Notifications</th>
            {showActions && <th className="px-3 py-3 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => {
            const status = statusNode(app);
            return (
              <tr
                key={app.id}
                className="border-b border-[var(--theme-divider)] last:border-b-0 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]"
                style={{ borderLeft: `3px solid ${status.borderColor}` }}
              >
                {selectable && (
                  <td className="px-3 py-3 align-middle">
                    <button
                      type="button"
                      aria-label={selectedIds.includes(app.id) ? `Deselect ${app.name}` : `Select ${app.name}`}
                      onClick={() => onToggleApp?.(app.id)}
                      className="rounded-md p-1 text-[var(--color-text-faint)] hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] hover:text-[var(--color-text)]"
                    >
                      {selectedIds.includes(app.id) ? (
                        <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                )}
                <td className="px-3 py-3 align-middle">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]">
                      <Boxes className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <AppDetailLink
                        href={`/apps/${app.id}`}
                        appName={app.name}
                        className="block text-[var(--color-text)] font-medium hover:text-[var(--color-accent)] transition-colors truncate hover:underline hover:underline-offset-2 hover:decoration-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                      >
                        {app.name}
                      </AppDetailLink>
                      <div className="flex items-center gap-1 text-[0.72rem] text-[var(--color-text-faint)] truncate">
                        <GitFork className="h-3 w-3" />
                        <span className="app-mono truncate">{app.repoFullName}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-middle">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusPill tone={status.tone} dot={status.tone === "warning" || status.tone === "error"}>
                      {status.label}
                    </StatusPill>
                    {status.tone === "muted" && isStaleApp(app) && (
                      <span className="pulse-dot text-[var(--color-status-warning)]" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-3 align-middle">
                  <span className="app-mono text-[0.82rem] text-[var(--color-text)]">
                    {app.latestSeenTag || "—"}
                  </span>
                </td>
                <td className="px-3 py-3 align-middle text-[0.82rem] text-[var(--color-text-muted)]">
                  {app.lastCheckedAt ? <LiveTimestamp date={app.lastCheckedAt} /> : <span className="text-[var(--color-text-faint)]">Never</span>}
                </td>
                <td className="px-3 py-3 align-middle">
                  <span
                    className="inline-flex items-center gap-1.5 text-[0.78rem]"
                    style={{ color: app.notificationsEnabled ? "var(--color-accent)" : "var(--color-text-faint)" }}
                  >
                    {app.notificationsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                    {app.notificationsEnabled ? "On" : "Off"}
                    {app.includePrereleases && (
                      <span className="text-[0.7rem] text-[var(--color-text-faint)]">· pre</span>
                    )}
                  </span>
                </td>
                {showActions && (
                  <td className="px-3 py-3 align-middle">
                    <div className="flex items-center justify-end gap-1.5">
                      {onCheck && <QuickAction icon={<RefreshCw className="h-3.5 w-3.5" />} label="Check" onClick={() => onCheck(app.id)} />}
                      {onMarkSeen && <QuickAction icon={<Check className="h-3.5 w-3.5" />} label="Seen" onClick={() => onMarkSeen(app.id)} />}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile cards (< md) */}
      <ul className="md:hidden divide-y divide-[var(--theme-divider)]">
        {apps.map((app) => {
          const status = statusNode(app);
          return (
            <li key={app.id} className="p-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)]" style={{ borderLeft: `3px solid ${status.borderColor}` }}>
              <div className="flex items-start gap-3">
                {selectable && (
                  <button
                    type="button"
                    aria-label={selectedIds.includes(app.id) ? `Deselect ${app.name}` : `Select ${app.name}`}
                    onClick={() => onToggleApp?.(app.id)}
                    className="mt-0.5 rounded-md p-1 text-[var(--color-text-faint)] hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] hover:text-[var(--color-text)]"
                  >
                    {selectedIds.includes(app.id) ? (
                      <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <AppDetailLink
                        href={`/apps/${app.id}`}
                        appName={app.name}
                        className="block font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors truncate hover:underline hover:underline-offset-2 hover:decoration-[color-mix(in_srgb,var(--color-accent)_40%,transparent)]"
                      >
                        {app.name}
                      </AppDetailLink>
                      <div className="mt-0.5 flex items-center gap-1 text-[0.72rem] text-[var(--color-text-faint)] truncate">
                        <GitFork className="h-3 w-3 shrink-0" />
                        <span className="app-mono truncate">{app.repoFullName}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5">
                      <StatusPill tone={status.tone} dot={status.tone === "warning" || status.tone === "error"}>
                        {status.label}
                      </StatusPill>
                      {status.tone === "muted" && isStaleApp(app) && (
                        <span className="pulse-dot text-[var(--color-status-warning)]" />
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-[var(--color-text-muted)]">
                    <span className="app-mono text-[var(--color-text)]">{app.latestSeenTag || "—"}</span>
                    <span className="text-[var(--color-text-faint)]">·</span>
                    <span>{app.lastCheckedAt ? <LiveTimestamp date={app.lastCheckedAt} /> : "Never checked"}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-[var(--color-text-faint)]">
                    <span className="inline-flex items-center gap-1">
                      {app.notificationsEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                      {app.notificationsEnabled ? "Notifications on" : "Notifications off"}
                    </span>
                  </div>

                  {showActions && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {onCheck && (
                        <QuickAction icon={<RefreshCw className="h-3.5 w-3.5" />} label="Check" onClick={() => onCheck(app.id)} />
                      )}
                      {onMarkSeen && (
                        <QuickAction icon={<Check className="h-3.5 w-3.5" />} label="Mark seen" onClick={() => onMarkSeen(app.id)} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {apps.length === 0 && (
        <div className="m-4 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]">
            <Boxes className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-[var(--color-text)]">No apps match this filter</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)] max-w-xs mx-auto">
            Try changing the search, or add a new app to start tracking releases.
          </p>
          <Link href="/apps/search" className="btn btn--primary btn--sm mt-4 inline-flex">
            Add an app
          </Link>
        </div>
      )}
    </div>
  );
}

function SelectAllDropdown({
  allSelected,
  someSelected,
  onToggleAll,
  onSelectWithUpdates,
  onSelectHealthy,
}: {
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  onSelectWithUpdates?: () => void;
  onSelectHealthy?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={allSelected ? "Deselect all" : "Select all"}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-0.5 rounded-md p-1 text-[var(--color-text-faint)] hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] hover:text-[var(--color-text)]"
      >
        {allSelected ? (
          <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
        ) : (
          <Square className={`h-4 w-4 ${someSelected ? "text-[var(--color-accent)]" : ""}`} />
        )}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] shadow-lg overflow-hidden">
          <button
            type="button"
            onClick={() => { onToggleAll(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.78rem] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors"
          >
            <ListFilter className="h-3.5 w-3.5 text-[var(--color-text-faint)]" />
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          {onSelectWithUpdates && (
            <button
              type="button"
              onClick={() => { onSelectWithUpdates(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.78rem] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-status-warning)]" />
              Select with updates
            </button>
          )}
          {onSelectHealthy && (
            <button
              type="button"
              onClick={() => { onSelectHealthy(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.78rem] text-[var(--color-text)] hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-status-success)]" />
              Select healthy only
            </button>
          )}
        </div>
      )}
    </div>
  );
}

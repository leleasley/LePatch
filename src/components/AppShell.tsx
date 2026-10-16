"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  Boxes,
  Gauge,
  Library,
  Search,
  User,
  Menu,
  X,
  Bell,
  ChevronDown,
  Terminal,
  Settings,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { ModalShell } from "@/components/ModalShell";
import { CommandPalette, useCommandPaletteKey, type Command } from "@/components/ui/Tabs";
import { RepoSwitcher } from "@/components/ui/RepoSwitcher";
import { isAdministrator, isModerator, roleLabels } from "@/lib/rbac";
import { cn } from "@/lib/cn";
import type { UserRole } from "@prisma/client";

type UserInfo = { id: string; name: string; email: string; role: string };
type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  exact?: boolean;
};

function buildNav(role: string | null) {
  const mainNav: NavItem[] = [];
  if (role !== "restricted") {
    mainNav.push({ href: "/dashboard", label: "Overview", icon: Gauge });
    mainNav.push({ href: "/apps", label: "Watched apps", icon: Boxes, exact: true });
  }

  const discoverNav: NavItem[] = [
    { href: "/apps/search", label: "Find repositories", icon: Search },
    { href: "/profile/repos", label: "My repositories", icon: Library },
  ];

  const utilityNav: NavItem[] = [{ href: "/profile/security", label: "Profile", icon: User }];
  if (role === "administrator") {
    utilityNav.push({ href: "/profile/notifications", label: "Notifications", icon: Bell });
  }

  const adminItems: NavItem[] = [];
  if (isAdministrator(role)) {
    adminItems.push(
      { href: "/admin/logs", label: "Logs & queues", icon: Terminal },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    );
  } else if (isModerator(role)) {
    adminItems.push({ href: "/admin/settings", label: "Settings", icon: Settings });
  }

  return { mainNav, discoverNav, utilityNav, adminItems };
}

function bestMatch(pathname: string, items: readonly NavItem[]): string {
  let best = "";
  let bestLen = -1;
  for (const item of items) {
    const matches = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
    if (matches && item.href.length > bestLen) {
      bestLen = item.href.length;
      best = item.href;
    }
  }
  return best;
}

function NavRow({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-elevated hover:text-text"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "text-text-faint")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavGroup({ title, items, pathname, onNavigate }: { title: string; items: readonly NavItem[]; pathname: string; onNavigate?: () => void }) {
  const activeHref = bestMatch(pathname, items);
  return (
    <div className="py-3">
      <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-text-faint">{title}</div>
      <nav className="space-y-0.5">
        {items.map((item) => (
          <NavRow key={item.href} item={item} active={activeHref === item.href} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

function UserSwitcher({ currentName, role }: { currentName: string | null; role: string | null }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  const loadUsers = useCallback(async () => {
    startTransition(() => setLoading(true));
    try {
      const res = await fetch("/api/admin/users-cached");
      if (res.ok) {
        const data = await res.json();
        startTransition(() => setUsers(data.users || []));
      }
    } catch {
      // ignore
    } finally {
      startTransition(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    if (open && users.length === 0 && role === "administrator") loadUsers();
  }, [open, users.length, role, loadUsers]);

  return (
    <div ref={ref} className="relative mt-3">
      <button
        onClick={() => {
          if (role === "administrator") {
            setOpen((v) => !v);
            if (!open) loadUsers();
          }
        }}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text transition-colors hover:border-accent/40"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
          {(currentName || "U").slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-left">{currentName || "User"}</span>
        {role === "administrator" && <ChevronDown className={cn("h-3.5 w-3.5 text-text-faint transition-transform", open && "rotate-180")} />}
      </button>

      {open && role === "administrator" && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface-elevated shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-xs text-text-faint">Loading…</div>
          ) : users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-faint">No users found</div>
          ) : (
            users.map((u) => (
              <Link key={u.id} href="/admin/settings?tab=users" className="flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface hover:text-text">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {u.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{u.name}</span>
                  <span className="block truncate text-[11px] text-text-faint">
                    {u.email} · {roleLabels[u.role as UserRole] || u.role}
                  </span>
                </span>
              </Link>
            ))
          )}
          <Link href="/admin/settings?tab=users" className="block border-t border-border px-3 py-2 text-xs font-medium text-accent hover:bg-surface">
            Manage users →
          </Link>
        </div>
      )}
    </div>
  );
}

function MobileDrawer({
  open,
  onClose,
  userName,
  homeHref,
  groups,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  userName: string | null;
  homeHref: string;
  groups: Array<{ title: string; items: readonly NavItem[] }>;
  pathname: string;
}) {
  if (!open) return null;
  return (
    <ModalShell open={open} onClose={onClose} panelClassName="top-sheet lg:hidden" overlayClassName="lg:hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-text-faint">Menu</div>
          <div className="mt-0.5 text-base font-semibold text-text">{userName || "LePatch"}</div>
        </div>
        <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-2 text-text-muted hover:bg-surface-elevated hover:text-text">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-3 pb-6">
        <Link
          href={homeHref}
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === homeHref ? "bg-accent/10 text-accent" : "text-text-muted hover:bg-surface-elevated hover:text-text"
          )}
        >
          <Gauge className={cn("h-4 w-4", pathname === homeHref ? "text-accent" : "text-text-faint")} />
          Home
        </Link>
        {groups.map((group) => (
          <NavGroup key={group.title} title={group.title} items={group.items} pathname={pathname} onNavigate={onClose} />
        ))}
        <div className="border-t border-border pt-3">
          <LogoutButton />
        </div>
      </div>
    </ModalShell>
  );
}

export function AppShell({ children, userRole = null, userName = null }: { children: ReactNode; userRole?: string | null; userName?: string | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteKey(setPaletteOpen);
  const { mainNav, discoverNav, utilityNav, adminItems } = buildNav(userRole);
  const homeHref = userRole === "restricted" ? "/apps/search" : "/dashboard";

  const groups: Array<{ title: string; items: readonly NavItem[] }> = [
    { title: "Monitor", items: mainNav },
    { title: "Discover", items: discoverNav },
    { title: "Account", items: utilityNav },
    ...(adminItems.length ? [{ title: "Admin", items: adminItems }] : []),
  ];

  const commands: Command[] = [
    ...groups.flatMap((group) =>
      group.items.map((item) => ({
        id: item.href,
        label: item.label,
        group: group.title,
        href: item.href,
      }))
    ),
    { id: "search-repos", label: "Find a repository to watch", group: "Actions", href: "/apps/search" },
    { id: "check-all", label: "Check watched repositories now", group: "Actions", run: () => window.dispatchEvent(new CustomEvent("lepatch:check-all")) },
    { id: "copy-mcp", label: "Copy API base URL", group: "Actions", run: () => navigator.clipboard?.writeText(window.location.origin) },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="shrink-0 p-4">
          <Link href={homeHref} className="flex items-center gap-2.5">
            <img src="/assets/Logo.png" alt="LePatch" className="h-8 w-8 rounded-md" />
            <span className="text-lg font-semibold tracking-tight text-text">LePatch</span>
          </Link>
          <UserSwitcher currentName={userName} role={userRole} />
          <RepoSwitcher className="mt-2" />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <NavGroup key={group.title} title={group.title} items={group.items} pathname={pathname} />
          ))}
        </div>
        <div className="shrink-0 border-t border-border p-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="mb-2 flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Command palette</span>
            <kbd className="rounded border border-border px-1 text-2xs text-text-faint">⌘K</kbd>
          </button>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="mobile-header sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 lg:hidden">
        <Link href={homeHref} className="flex items-center gap-2.5">
          <img src="/assets/Logo.png" alt="LePatch" className="h-7 w-7 rounded-md" />
          <span className="text-base font-semibold tracking-tight text-text">LePatch</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden h-8 items-center gap-2 rounded-md border border-border bg-surface-elevated px-2 text-xs text-text-muted transition-colors hover:border-accent/50 hover:text-text lg:flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="rounded border border-border px-1 text-2xs text-text-faint">⌘K</kbd>
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            className="icon-button lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="mobile-content lg:pl-60">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <MobileDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        userName={userName}
        homeHref={homeHref}
        groups={groups}
        pathname={pathname}
      />
    </div>
  );
}
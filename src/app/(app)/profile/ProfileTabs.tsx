"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, GitBranch, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ProfileTabsProps = {
  isAdmin: boolean;
  githubLinked: boolean;
};

const baseTabs = [
  { href: "/profile/security", label: "Security", icon: Shield },
];

const repoTab = { href: "/profile/repos", label: "Repositories", icon: GitBranch };

const adminTabs = [
  { href: "/profile/notifications", label: "Notifications", icon: Bell },
];

export function ProfileTabs({ isAdmin, githubLinked }: ProfileTabsProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tabs = [
    ...baseTabs,
    ...(githubLinked ? [repoTab] : []),
    ...(isAdmin ? adminTabs : []),
  ];
  const active =
    tabs.find((tab) => pathname === tab.href || pathname.startsWith(tab.href + "/")) || tabs[0];

  useEffect(() => {
    if (!open) return;
    function handle(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  return (
    <div className="mb-6">
      <div ref={ref} className="relative z-40 sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line/50 bg-panel/80 px-4 py-3.5 text-sm font-medium text-text shadow-lg shadow-black/10"
        >
          <span className="flex items-center gap-2">
            <active.icon className="h-4 w-4 text-accent" />
            {active.label}
          </span>
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open ? (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-line/50 bg-panel shadow-xl shadow-black/40 p-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.href === active.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-text hover:bg-white/[0.04] hover:text-text"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-accent" : "text-text-muted"}`} />
                    {tab.label}
                  </Link>
                );
              })}
            </div>
        ) : null}
      </div>

      <div className="hidden rounded-xl border border-line/50 bg-panel/80 p-1 sm:flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-accent/10 text-accent shadow-sm"
                  : "text-text-muted hover:bg-white/[0.04] hover:text-text"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-accent" : "text-text-muted"}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

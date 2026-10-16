"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, GitBranch, Shield } from "lucide-react";

type ProfileTabsProps = {
  isAdmin: boolean;
  githubLinked: boolean;
};

const securityTab = { href: "/profile/security", label: "Security", icon: Shield };
const repoTab = { href: "/profile/repos", label: "Repositories", icon: GitBranch };
const notificationsTab = { href: "/profile/notifications", label: "Notifications", icon: Bell };

export function ProfileTabs({ isAdmin, githubLinked }: ProfileTabsProps) {
  const pathname = usePathname();
  const tabs = [
    securityTab,
    ...(githubLinked ? [repoTab] : []),
    ...(isAdmin ? [notificationsTab] : []),
  ];

  return (
    <nav aria-label="Profile sections" className="app-tabs scrollbar-none mb-6">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-active={isActive}
            aria-current={isActive ? "page" : undefined}
            className="app-tab"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

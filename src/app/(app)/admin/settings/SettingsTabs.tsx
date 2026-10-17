"use client";

import { useState } from "react";
import { Settings, Send, Server, Users, Database, ClipboardList } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { isAdministrator } from "@/lib/rbac";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { GeneralTab } from "./GeneralTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { SystemTab } from "./SystemTab";
import { UsersClient } from "@/app/(app)/admin/users/UsersClient";
import { BackupsClient } from "@/app/(app)/admin/backups/BackupsClient";
import { AuditClient } from "@/app/(app)/admin/audit/AuditClient";

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  passwordEnabled: boolean;
};

const tabs = [
  { id: "general", label: "General", icon: Settings },
  { id: "integrations", label: "Integrations", icon: Send },
  { id: "users", label: "Users", icon: Users, adminOnly: true },
  { id: "backups", label: "Backups", icon: Database, adminOnly: true },
  { id: "audit", label: "Audit log", icon: ClipboardList, adminOnly: true },
  { id: "system", label: "System", icon: Server, adminOnly: true },
];

export function SettingsTabs({
  settings,
  role,
  users,
  currentUserId,
}: {
  settings: Record<string, string>;
  role: UserRole;
  users: User[];
  currentUserId: string;
}) {
  const admin = isAdministrator(role);
  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || admin);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && visibleTabs.some((t) => t.id === tab)) return tab;
    }
    return "general";
  });

  // A link may point at an admin-only tab the current user cannot see.
  const active = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : visibleTabs[0]?.id ?? "general";

  return (
    <div>
      <Tabs
        ariaLabel="Settings sections"
        value={active}
        onChange={setActiveTab}
        items={visibleTabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          icon: <tab.icon className="h-4 w-4" aria-hidden="true" />,
        }))}
      />
      <div className="mt-6">
        <TabPanel id="general" active={active === "general"}>
          <GeneralTab initialSettings={settings} />
        </TabPanel>
        <TabPanel id="integrations" active={active === "integrations"}>
          <IntegrationsTab />
        </TabPanel>
        <TabPanel id="users" active={active === "users"}>
          <UsersClient users={users} currentUserId={currentUserId} />
        </TabPanel>
        <TabPanel id="backups" active={active === "backups"}>
          <BackupsClient />
        </TabPanel>
        <TabPanel id="audit" active={active === "audit"}>
          <AuditClient />
        </TabPanel>
        <TabPanel id="system" active={active === "system"}>
          <SystemTab initialSettings={settings} />
        </TabPanel>
      </div>
    </div>
  );
}

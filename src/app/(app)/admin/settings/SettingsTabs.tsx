"use client";

import { useState } from "react";
import { Settings, Send, Server, Users, Bookmark, Database, ClipboardList } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { isAdministrator } from "@/lib/rbac";
import { GeneralTab } from "./GeneralTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { SystemTab } from "./SystemTab";
import { UsersClient } from "@/app/(app)/admin/users/UsersClient";
import { CatalogueAdminClient } from "@/app/(app)/admin/catalogue/CatalogueAdminClient";
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
  { id: "catalogue", label: "Catalogue", icon: Bookmark },
  { id: "backups", label: "Backups", icon: Database, adminOnly: true },
  { id: "audit", label: "Audit Log", icon: ClipboardList, adminOnly: true },
  { id: "system", label: "System", icon: Server, adminOnly: true },
];

export function SettingsTabs({
  settings,
  role,
  users,
  currentUserId,
  initialCategories,
}: {
  settings: Record<string, string>;
  role: UserRole;
  users: User[];
  currentUserId: string;
  initialCategories: string[];
}) {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && tabs.some((t) => t.id === tab)) return tab;
    }
    return "general";
  });
  const admin = isAdministrator(role);

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || admin);

  return (
    <div>
      <div className="app-tabs">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="app-tab"
            data-active={activeTab === tab.id}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {activeTab === "general" && <GeneralTab initialSettings={settings} />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "users" && <UsersClient users={users} currentUserId={currentUserId} />}
        {activeTab === "catalogue" && <CatalogueAdminClient initialCategories={initialCategories} />}
        {activeTab === "backups" && <BackupsClient />}
        {activeTab === "audit" && <AuditClient />}
        {activeTab === "system" && <SystemTab initialSettings={settings} />}
      </div>
    </div>
  );
}

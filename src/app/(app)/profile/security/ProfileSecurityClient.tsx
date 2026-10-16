"use client";

import { Shield, Link2, Monitor, Fingerprint } from "lucide-react";
import { AccountForms } from "@/app/(app)/admin/settings/AccountForms";
import { PasskeysSection } from "@/app/(app)/admin/settings/PasskeysSection";
import { TelegramLinkSection } from "@/app/(app)/admin/settings/TelegramLinkSection";
import { GitHubLinkSection } from "@/app/(app)/admin/settings/GitHubLinkSection";
import { ActiveSessionsSection } from "@/components/ActiveSessionsSection";
import { MfaSection } from "@/components/MfaSection";
import { TrustedDevicesSection } from "@/components/TrustedDevicesSection";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  passwordEnabled: boolean;
};

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="rounded-lg bg-accent/10 p-2">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-text uppercase tracking-wider">{title}</h2>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
    </div>
  );
}

export function ProfileSecurityClient({
  user,
  sessionId,
}: {
  user: User;
  sessionId: string;
}) {
  return (
    <div className="space-y-8">
      {/* Account */}
      <section>
        <SectionHeader
          icon={Shield}
          title="Account"
          description="Manage your profile and credentials"
        />
        <AccountForms user={user} />
      </section>

      {/* Authentication */}
      <section>
        <SectionHeader
          icon={Fingerprint}
          title="Authentication"
          description="Passkeys, multi-factor authentication, and trusted devices"
        />
        <div className="space-y-4">
          <PasskeysSection passwordEnabled={user.passwordEnabled} sessionId={sessionId} />
          <MfaSection userEmail={user.email} />
          <TrustedDevicesSection />
        </div>
      </section>

      {/* Integrations */}
      <section>
        <SectionHeader
          icon={Link2}
          title="Integrations"
          description="Connect external accounts for notifications and sign-in"
        />
        <div className="space-y-4">
          <TelegramLinkSection />
          <GitHubLinkSection />
        </div>
      </section>

      {/* Sessions */}
      <section>
        <SectionHeader
          icon={Monitor}
          title="Sessions"
          description="View and manage your active sessions"
        />
        <ActiveSessionsSection currentSessionId={sessionId} />
      </section>
    </div>
  );
}

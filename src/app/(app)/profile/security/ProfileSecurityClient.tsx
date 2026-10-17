"use client";

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

export function ProfileSecurityClient({
  user,
  sessionId,
}: {
  user: User;
  sessionId: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AccountForms user={user} />
      <PasskeysSection passwordEnabled={user.passwordEnabled} sessionId={sessionId} />
      <MfaSection userEmail={user.email} />
      <TrustedDevicesSection />
      <TelegramLinkSection />
      <GitHubLinkSection />
      <ActiveSessionsSection currentSessionId={sessionId} />
    </div>
  );
}

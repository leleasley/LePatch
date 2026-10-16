import { ProfileSecurityClient } from "./ProfileSecurityClient";
import { ThemePicker } from "@/components/ThemePicker";
import { getCurrentPageUser, getCurrentSessionId, requirePageSession } from "@/lib/auth";
import type { ThemeId } from "@/lib/theme";

export const metadata = { title: "Profile Security" };
export const dynamic = "force-dynamic";

export default async function ProfileSecurityPage() {
  await requirePageSession();
  const user = await getCurrentPageUser();
  const sessionId = await getCurrentSessionId();

  return (
    <div className="space-y-6">
      <ThemePicker initialTheme={((user as unknown as { theme: string }).theme as ThemeId) || "dark"} />
      <ProfileSecurityClient
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          passwordEnabled: user.passwordEnabled,
        }}
        sessionId={sessionId || ""}
      />
    </div>
  );
}

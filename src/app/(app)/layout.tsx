import { AppShell } from "@/components/AppShell";
import { ThemeSync } from "@/components/ThemeSync";
import { getCurrentPageUser } from "@/lib/auth";
import type { ThemeId } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userTheme: ThemeId = "dark";
  let userRole: string | null = null;
  let userName: string | null = null;
  try {
    const user = await getCurrentPageUser();
    if (user && typeof user === "object" && "theme" in user) {
      userTheme = (user as { theme: string }).theme as ThemeId;
      userRole = (user as { role: string }).role;
      userName = (user as { name: string }).name;
    }
  } catch {
    // Not logged in, use default theme
  }

  return (
    <AppShell userRole={userRole} userName={userName}>
      <ThemeSync userTheme={userTheme} />
      {children}
    </AppShell>
  );
}

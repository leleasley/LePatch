import { requirePageModerator } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageModerator();
  return <>{children}</>;
}

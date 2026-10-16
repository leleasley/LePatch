import Link from "next/link";
import { StatusPage } from "@/components/StatusPage";

export const metadata = { title: "Page Not Found" };
export default function NotFoundPage() {
  return (
    <StatusPage
      code="404 Not Found"
      title="Page not found"
      description="The page you requested does not exist, or the resource has already been removed."
      actions={[
        { href: "/", label: "Go Home" },
        { href: "/login", label: "Go to Login", variant: "secondary" },
      ]}
    >
      <Link href="/apps" className="text-sm text-accent transition-colors hover:text-accent">
        Open Apps instead
      </Link>
    </StatusPage>
  );
}

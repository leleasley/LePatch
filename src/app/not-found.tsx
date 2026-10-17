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
        { href: "/", label: "Go home" },
        { href: "/login", label: "Go to login", variant: "secondary" },
      ]}
    >
      <Link href="/apps" className="btn btn--subtle btn--sm mt-4">
        Open repositories instead
      </Link>
    </StatusPage>
  );
}

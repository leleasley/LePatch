import { StatusPage } from "@/components/StatusPage";

export const metadata = { title: "Forbidden" };

export default function ForbiddenRoutePage() {
  return (
    <StatusPage
      code="403 Forbidden"
      title="Access denied"
      description="You are signed in, but this account does not have permission to view this page."
      note="Administrator-only areas are restricted."
      actions={[
        { href: "/", label: "Go home" },
        { href: "/profile", label: "Open profile", variant: "secondary" },
      ]}
    />
  );
}

import { StatusPage } from "@/components/StatusPage";

export const metadata = { title: "Unauthorized" };

export default function UnauthorizedRoutePage() {
  return (
    <StatusPage
      code="401 Unauthorized"
      title="Sign in required"
      description="You need an active session to view this area."
      actions={[
        { href: "/login", label: "Go to login" },
        { href: "/", label: "Go home", variant: "secondary" },
      ]}
    />
  );
}

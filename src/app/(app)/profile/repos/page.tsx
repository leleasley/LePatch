import { ReposClient } from "./ReposClient";

export const metadata = { title: "My Repositories" };
export const dynamic = "force-dynamic";

export default function ReposPage() {
  return <ReposClient />;
}

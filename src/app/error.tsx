"use client";

import { StatusPage } from "@/components/StatusPage";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const digest = (error as Error & { digest?: string }).digest;

  return (
    <StatusPage
      code="500 Server Error"
      title="Something went wrong"
      description="LePatch hit an unexpected error while loading this page."
      note={digest ? `Reference: ${digest}` : "Try reloading. If this keeps happening, check the server logs."}
      actions={[
        { href: "/", label: "Go home", variant: "secondary" },
      ]}
    >
      <button onClick={reset} className="btn btn--primary btn--lg mt-6 w-full">
        Try again
      </button>
    </StatusPage>
  );
}

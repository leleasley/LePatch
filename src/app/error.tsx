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
        { href: "/", label: "Go Home", variant: "secondary" },
      ]}
    >
      <div className="pt-2">
        <button
          onClick={reset}
          className="focus-ring rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
        >
          Try again
        </button>
      </div>
    </StatusPage>
  );
}

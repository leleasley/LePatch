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
          className="focus-ring rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400"
        >
          Try again
        </button>
      </div>
    </StatusPage>
  );
}

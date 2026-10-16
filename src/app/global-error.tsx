"use client";

import { StatusPage } from "@/components/StatusPage";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <StatusPage
          code="500 Server Error"
          title="Application error"
          description="LePatch hit an unexpected failure while building this screen."
          note={error.digest ? `Reference: ${error.digest}` : "Try reloading the page. If the problem persists, check the server logs."}
          actions={[{ href: "/", label: "Go home", variant: "secondary" }]}
        >
          <button onClick={reset} className="btn btn--primary btn--lg mt-6 w-full">
            Try again
          </button>
        </StatusPage>
      </body>
    </html>
  );
}

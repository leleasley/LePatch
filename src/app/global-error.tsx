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
        >
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <button
              onClick={reset}
              className="focus-ring inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground shadow-lg shadow-cyan-500/20 transition-all hover:bg-accent"
            >
              Try Again
            </button>
            <a
              href="/"
              className="focus-ring inline-flex items-center justify-center rounded-lg border border-line/60 bg-surface px-5 py-2.5 text-sm font-medium text-text transition-all hover:border-accent/40 hover:text-text"
            >
              Go Home
            </a>
          </div>
        </StatusPage>
      </body>
    </html>
  );
}

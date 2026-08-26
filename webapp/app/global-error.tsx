"use client";

// Root error boundary for the App Router. Next renders this when a render throws above the route
// segment boundary. Sentry.captureException is a no-op until a client is initialised (no DSN), so
// this reports to Sentry when configured and otherwise just shows the fallback.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", opacity: 0.8 }}>An unexpected error occurred. Please try again.</p>
        <button
          onClick={() => reset()}
          style={{ marginTop: "1.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

// Next.js instrumentation hook. register() loads the matching Sentry runtime config; each is DSN-
// gated, so with no DSN both imports run but neither calls Sentry.init (clean no-op).
// onRequestError forwards uncaught App Router server errors to Sentry (also a no-op with no client).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;

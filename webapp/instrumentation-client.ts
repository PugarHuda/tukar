// Sentry browser init. Next.js 15.3+ auto-loads this file on the client. Gated on the public DSN:
// with none set (current state) Sentry.init never runs, so the browser SDK loads no transport and
// makes zero requests to any Sentry ingest host — nothing for the CSP to block.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/log";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    ...sentryOptions,
    // Browser bundles only inline NEXT_PUBLIC_* env, so the client override is its own variable.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? sentryOptions.tracesSampleRate),
  });
}

// App Router navigation instrumentation. Safe to export unconditionally: it is a no-op until a
// client is initialised above.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

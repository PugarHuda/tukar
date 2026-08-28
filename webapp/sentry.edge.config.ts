// Sentry edge-runtime init (middleware + edge routes). Loaded by instrumentation.ts register() on
// the edge runtime only. Same DSN gate: no DSN -> Sentry.init never runs -> clean no-op.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/log";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn, ...sentryOptions });
}

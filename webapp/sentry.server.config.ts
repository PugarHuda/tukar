// Sentry server-runtime init. Loaded by instrumentation.ts register() on the Node.js runtime only.
// Gated on the DSN: with no NEXT_PUBLIC_SENTRY_DSN set (the current state) Sentry.init never runs,
// so this is a clean no-op with zero transport, zero network calls, and zero console noise.
// Sampling, PII, ignored wallet-cancel errors and the secret scrubber are shared via lib/log.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/log";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({ dsn, ...sentryOptions });
}

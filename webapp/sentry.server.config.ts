// Sentry server-runtime init. Loaded by instrumentation.ts register() on the Node.js runtime only.
// Gated on the DSN: with no NEXT_PUBLIC_SENTRY_DSN set (the current state) Sentry.init never runs,
// so this is a clean no-op with zero transport, zero network calls, and zero console noise.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Trace sampling is opt-in via env so an enabled DSN does not silently ship 100% of traces.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Never capture request bodies / headers: this app moves money and handles PII-shaped payloads.
    sendDefaultPii: false,
  });
}

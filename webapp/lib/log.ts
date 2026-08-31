// Tiny structured logger: one JSON line per event to stdout/stderr, so Vercel's log drains (and any
// aggregator) ingest it as structured data instead of free-text. No deps, works in the Next.js node
// and edge runtimes. Stable shape: { level, time, msg, ...fields }.
//
// It never logs secrets on its own — it only serialises the fields the caller passes, so callers
// pass request ids, route names, and errMsg(e) (the error message), never env values or raw bodies.
//
// Every line is also mirrored to Sentry: warn -> breadcrumb (attached to the next event), error ->
// captureException with the fields as extra. With no DSN there is no Sentry client, so both calls
// are no-ops; the console output is unchanged either way.
import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent } from "@sentry/nextjs";

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  // info -> stdout, warn/error -> stderr, matching how platforms split the two log streams.
  if (level === "info") console.log(line);
  else console.error(line);
  if (level === "warn") Sentry.addBreadcrumb({ level: "warning", category: "log", message: msg, data: fields });
  if (level === "error") {
    const err = fields?.err;
    Sentry.captureException(err instanceof Error ? err : new Error(msg), {
      extra: fields,
      tags: { route: typeof fields?.route === "string" ? fields.route : undefined },
    });
  }
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

// Correlate every line from one request. Prefer Vercel's per-request x-vercel-id; else generate one.
export function requestId(req: Request): string {
  return (
    req.headers.get("x-vercel-id") ||
    globalThis.crypto?.randomUUID?.() ||
    Math.random().toString(36).slice(2)
  );
}

// Message only — never the whole thrown object — so an error can be logged without dragging along
// whatever a library attached to it. Sentry (when configured) captures the full stack separately.
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---- Sentry options shared by the server / edge / browser inits ----------------------------------

// Secret-shaped substrings that must never reach Sentry: 64-hex field elements / hashes, long
// decimal strings (note secrets, nullifiers, commitments are ~77-digit decimals), Stellar secret
// seeds (S + 55 base32 chars). Replaced in place so the surrounding message stays readable.
const SCRUB: [RegExp, string][] = [
  [/\bS[A-Z2-7]{55}\b/g, "[seed]"],
  [/\b[0-9a-fA-F]{64}\b/g, "[hex64]"],
  [/\b\d{20,}\b/g, "[bigint]"],
];

export function scrubText(s: string): string {
  return SCRUB.reduce((acc, [re, to]) => acc.replace(re, to), s);
}

// Scrub every string reachable from a value (breadcrumb data, extra); non-strings pass through.
function scrubDeep<T>(v: T): T {
  if (typeof v === "string") return scrubText(v) as T;
  if (Array.isArray(v)) return v.map(scrubDeep) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, scrubDeep(x)])) as T;
  }
  return v;
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrubText(ex.value);
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
    if (b.data) b.data = scrubDeep(b.data);
    // navigation breadcrumbs carry full URLs; the fragment can hold a bearer note or a receipt
    for (const k of ["from", "to", "url"] as const) {
      const v = (b.data as any)?.[k];
      if (typeof v === "string" && v.includes("#")) (b.data as any)[k] = v.split("#")[0] + "#[fragment removed]";
    }
  }
  if (event.extra) event.extra = scrubDeep(event.extra);
  // The page URL is attached to every event; /receiver#claim= and /verify#r= promise the fragment
  // never leaves the browser, so it never leaves in an error report either.
  const req = (event as any).request;
  if (req && typeof req.url === "string" && req.url.includes("#")) req.url = req.url.split("#")[0] + "#[fragment removed]";
  return event;
}

// The exact strings the wallet layer throws when the user backs out of signing (nothing to fix):
//   "The user rejected this request." -> @stellar/freighter-api FreighterApiDeclinedError
//   "User declined access"            -> the Freighter extension itself
//   "The user closed the modal." / "Session closed" -> @creit.tech/stellar-wallets-kit
export const IGNORE_ERRORS: (string | RegExp)[] = [
  "The user rejected this request.",
  "The user closed the modal.",
  "Session closed",
  /user (declined|rejected|cancel)/i,
];

// 20% of traces in production, everything in dev. SENTRY_TRACES_SAMPLE_RATE still overrides.
export const TRACES_SAMPLE_RATE = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? (process.env.NODE_ENV === "production" ? 0.2 : 1));

export const sentryOptions = {
  tracesSampleRate: TRACES_SAMPLE_RATE,
  // Never capture request bodies / headers: this app moves money and handles PII-shaped payloads.
  sendDefaultPii: false,
  ignoreErrors: IGNORE_ERRORS,
  beforeSend: scrubEvent,
};

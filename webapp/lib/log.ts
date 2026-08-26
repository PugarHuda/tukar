// Tiny structured logger: one JSON line per event to stdout/stderr, so Vercel's log drains (and any
// aggregator) ingest it as structured data instead of free-text. No deps, works in the Next.js node
// and edge runtimes. Stable shape: { level, time, msg, ...fields }.
//
// It never logs secrets on its own — it only serialises the fields the caller passes, so callers
// pass request ids, route names, and errMsg(e) (the error message), never env values or raw bodies.
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  // info -> stdout, warn/error -> stderr, matching how platforms split the two log streams.
  if (level === "info") console.log(line);
  else console.error(line);
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

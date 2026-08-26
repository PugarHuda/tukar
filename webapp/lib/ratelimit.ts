import { NextResponse } from "next/server";

// In-memory sliding-window rate limiter keyed by client IP. A real control against DoS /
// compute-amplification on the open API routes: it rejects the (N+1)th request inside the window
// with a 429 the caller can back off on.
//
// ponytail: per-instance only. State lives in this module's Map, so it resets on cold start and is
// NOT shared across concurrent serverless instances — a client hitting two warm instances gets up
// to 2x the limit. That is fine as a first line of defense (Fluid Compute reuses one warm instance
// for bursts from the same client). For a hard, cluster-wide guarantee, back this with a KV such as
// Upstash Redis (INCR + EXPIRE, or a sorted-set sliding window) — same call sites, swap the store.

type Hit = number[]; // request timestamps (ms) within the current window
const buckets = new Map<string, Hit>();

// Client IP from Vercel's x-forwarded-for (first hop is the real client). Falls back to a shared
// key so a missing header degrades to a global limit rather than no limit.
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export interface RateLimitOptions {
  key: string; // route bucket namespace, so limits are per-route not global
  limit: number; // max requests allowed per window
  windowMs: number; // window length in ms
}

export interface RateLimitResult {
  ok: boolean;
  retryAfter?: number; // seconds until the oldest request in the window expires (for Retry-After)
}

export function rateLimit(req: Request, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const id = `${opts.key}:${clientIp(req)}`;

  const recent = (buckets.get(id) ?? []).filter((t) => t > cutoff);

  if (recent.length >= opts.limit) {
    buckets.set(id, recent); // keep the pruned list so it does not grow unbounded
    const retryAfter = Math.max(1, Math.ceil((recent[0]! + opts.windowMs - now) / 1000));
    return { ok: false, retryAfter };
  }

  recent.push(now);
  buckets.set(id, recent);

  // Opportunistic sweep: drop a few idle buckets so the Map does not leak keys for one-shot IPs.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= cutoff)) buckets.delete(k);
    }
  }

  return { ok: true };
}

// 429 helper: JSON body + Retry-After header, the shape every rate-limited route returns.
export function tooManyRequests(retryAfter?: number) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
  );
}

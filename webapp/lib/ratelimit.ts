import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Sliding-window rate limiter keyed by client IP. A real control against DoS /
// compute-amplification on the open API routes: it rejects the (N+1)th request inside the window
// with a 429 the caller can back off on.
//
// Two backends, chosen at runtime by whether Upstash Redis env is present:
//   - DISTRIBUTED (Redis): when KV_REST_API_URL + KV_REST_API_TOKEN (or the portable
//     UPSTASH_REDIS_REST_URL / _TOKEN) are set, every serverless instance shares one Upstash
//     sliding-window counter, so the limit is cluster-wide and survives cold starts.
//   - IN-MEMORY (fallback): when that env is absent, state lives in this module's Map — per-instance
//     only, resets on cold start, and a client hitting two warm instances gets up to 2x the limit.
//     Fine as a first line of defense for local dev / previews without a KV bound.

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
  retryAfter?: number; // seconds until the caller may retry (for Retry-After)
}

// --- Distributed (Upstash Redis) backend --------------------------------------------------------

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

let redis: Redis | null = null;
// One Ratelimit instance per (key,limit,windowMs) config, so each route gets its own Redis prefix
// and window. Cached because constructing them is cheap but re-creating per request is wasteful.
const limiters = new Map<string, Ratelimit>();

function getLimiter(opts: RateLimitOptions): Ratelimit | null {
  const env = upstashEnv();
  if (!env) return null; // no Upstash configured -> caller uses in-memory path
  if (!redis) redis = new Redis({ url: env.url, token: env.token });

  const cacheKey = `${opts.key}:${opts.limit}:${opts.windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    const windowSeconds = Math.max(1, Math.ceil(opts.windowMs / 1000));
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${windowSeconds} s`),
      prefix: `rl:${opts.key}`, // distinct namespace per route
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

let announced = false;
function announceBackend() {
  if (announced) return;
  announced = true;
  const backend = upstashEnv() ? "distributed (Upstash Redis)" : "in-memory (per-instance)";
  console.log(`[ratelimit] backend: ${backend}`);
}

// --- Public API ---------------------------------------------------------------------------------

// Async because the Upstash `.limit()` call is async. The in-memory path resolves synchronously but
// keeps the same Promise contract so call sites `await` uniformly.
export async function rateLimit(req: Request, opts: RateLimitOptions): Promise<RateLimitResult> {
  announceBackend();
  const ip = clientIp(req);

  const limiter = getLimiter(opts);
  if (limiter) {
    const res = await limiter.limit(ip);
    if (res.success) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
    return { ok: false, retryAfter };
  }

  // Fallback: per-instance in-memory sliding window.
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const id = `${opts.key}:${ip}`;

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

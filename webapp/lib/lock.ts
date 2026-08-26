// server-only: reads Upstash REST credentials from process.env; import only from server routes.
// (No `import "server-only"` guard: that package is a Next build-time alias and is unresolvable
// under vitest, which needs to import this module directly to test the real lock.)
import { Redis } from "@upstash/redis";

// Distributed lock over Upstash Redis, using SET NX PX for a true atomic acquire that Vercel Blob
// (no compare-and-set) cannot provide. The recurring cron uses it to make a double deposit
// impossible: only one runner can hold `recurring:<owner>:<planId>:<today>` at a time.
//
// Two modes, chosen at runtime by whether Upstash env is present (same env as lib/ratelimit.ts):
//   - DISTRIBUTED: KV_REST_API_URL + KV_REST_API_TOKEN (or portable UPSTASH_REDIS_REST_URL/_TOKEN)
//     set -> a real cluster-wide lock. acquire is SET NX, release is a token-checked delete.
//   - NO LOCK (fallback): env absent -> acquireLock returns the NO_LOCK sentinel and withLock runs
//     fn WITHOUT a lock, so the caller's existing claim-first behaviour still applies. Honest: this
//     is not a lock, it is "no distributed lock available, proceed unguarded".

// Sentinel returned by acquireLock when no Upstash env is configured. Distinct from a real token
// (never collides: real tokens are hex) and from null (which means "held by someone else").
export const NO_LOCK = "no-distributed-lock";

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

let _redis: Redis | null = null;
function redis(): Redis | null {
  const env = upstashEnv();
  if (!env) return null;
  if (!_redis) _redis = new Redis({ url: env.url, token: env.token });
  return _redis;
}

const randomToken = (): string =>
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2) + Date.now().toString(16);

/**
 * Try to atomically acquire `lock:<key>` for ttlMs. Returns a fresh random token on success, null
 * if the lock is already held by someone else, or the NO_LOCK sentinel when Upstash is not
 * configured (the caller should then proceed unguarded via its own fallback).
 */
export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const r = redis();
  if (!r) return NO_LOCK;
  const token = randomToken();
  // SET lock:<key> <token> NX PX <ttlMs> — atomic: only the first caller inside the TTL wins.
  const ok = await r.set(`lock:${key}`, token, { nx: true, px: ttlMs });
  return ok === "OK" ? token : null;
}

// Compare-and-delete so a runner only ever releases its OWN lock (never one a later runner took
// after this TTL expired). Atomic via a tiny Lua script.
const RELEASE_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Release `lock:<key>` only if it still holds `token`. No-op for the NO_LOCK sentinel. */
export async function releaseLock(key: string, token: string): Promise<void> {
  if (token === NO_LOCK) return;
  const r = redis();
  if (!r) return;
  await r.eval(RELEASE_LUA, [`lock:${key}`], [token]);
}

export type WithLockResult<T> = { ran: true; result: T } | { ran: false; reason: "locked" };

/**
 * Acquire `key`, run fn, release in finally. If the lock is already held, does NOT run fn and
 * returns { ran: false, reason: "locked" }. If Upstash is not configured, runs fn WITHOUT a lock
 * (ran: true) so the caller's own claim-first guard remains the only protection — documented and
 * intentional, not a silent failure.
 */
export async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<WithLockResult<T>> {
  const token = await acquireLock(key, ttlMs);
  if (token === null) return { ran: false, reason: "locked" };
  try {
    return { ran: true, result: await fn() };
  } finally {
    await releaseLock(key, token); // no-op when token === NO_LOCK
  }
}

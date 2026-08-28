// server-only: the shared Upstash Redis client, or null when the env is absent so callers can fall
// back honestly (in-memory) instead of failing. Same env contract as lib/ratelimit.ts / lib/lock.ts:
// KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV) or the portable UPSTASH_REDIS_REST_URL / _TOKEN.
import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

export function redis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

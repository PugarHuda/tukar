// Reclaim session binding + single-use consumption. /api/reclaim binds the SDK session id to the
// Stellar address (and the provider version the SDK resolved server-side) the moment the request is
// minted; /api/reclaim/verify consumes that binding atomically, so a proof can only ever be accepted
// once, for the address it was minted for, against the provider version WE chose (never the client's).
//
// Two backends, same env contract as lib/ratelimit.ts:
//   - DISTRIBUTED (Upstash): SET NX EX to bind, GETDEL to consume. Cluster-wide and atomic.
//   - IN-MEMORY (fallback): per-instance Map with expiry. Honest ceiling: a second warm instance does
//     not see the binding, so verify would reject a valid proof there. Logged once as a warning.
import { redis } from "./redis";
import { log } from "./log";

export type ReclaimSession = { address: string; providerVersion: string };

// 15 minutes: the portal flow (phone scan + login + proof) comfortably fits; a stale binding is useless.
export const SESSION_TTL_S = 900;

const key = (sessionId: string) => `reclaim:session:${sessionId}`;

const memory = new Map<string, { value: ReclaimSession; expiresAt: number }>();
let warned = false;
function memoryBackend(now: number) {
  if (!warned) {
    warned = true;
    log.warn("reclaim sessions: no Upstash env, using per-instance memory (not shared across instances, lost on cold start)");
  }
  for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
}

/** Bind `sessionId` to `session` once. False if that id is already bound (never overwrites). */
export async function bindSession(sessionId: string, session: ReclaimSession, now = Date.now()): Promise<boolean> {
  const r = redis();
  if (r) return (await r.set(key(sessionId), session, { nx: true, ex: SESSION_TTL_S })) === "OK";
  memoryBackend(now);
  if (memory.has(sessionId)) return false;
  memory.set(sessionId, { value: session, expiresAt: now + SESSION_TTL_S * 1000 });
  return true;
}

/** Atomically read AND delete the binding: the first caller gets it, every later caller gets null. */
export async function consumeSession(sessionId: string, now = Date.now()): Promise<ReclaimSession | null> {
  const r = redis();
  if (r) return (await r.getdel<ReclaimSession>(key(sessionId))) ?? null;
  memoryBackend(now);
  const entry = memory.get(sessionId);
  memory.delete(sessionId);
  return entry && entry.expiresAt > now ? entry.value : null;
}

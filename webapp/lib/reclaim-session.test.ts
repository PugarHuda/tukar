import { describe, it, expect, beforeAll } from "vitest";

// Exercises the in-memory backend (no Upstash env): the same bind-once / consume-once contract the
// Redis path gets from SET NX EX + GETDEL. Clear any KV env first so the module picks the Map.
beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[k];
});

const session = { address: "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS", providerVersion: "1.0.0" };

describe("reclaim session binding (in-memory backend)", () => {
  it("binds once, consumes once, then is gone (replay rejected)", async () => {
    const { bindSession, consumeSession } = await import("./reclaim-session");
    const id = `s-${Math.random().toString(16).slice(2)}`;
    expect(await bindSession(id, session)).toBe(true);
    expect(await bindSession(id, { ...session, address: "GOTHER" })).toBe(false); // never overwrites
    expect(await consumeSession(id)).toEqual(session);
    expect(await consumeSession(id)).toBeNull();
  });

  it("expires after the TTL", async () => {
    const { bindSession, consumeSession, SESSION_TTL_S } = await import("./reclaim-session");
    const id = `s-${Math.random().toString(16).slice(2)}`;
    const t0 = 1_000_000;
    expect(await bindSession(id, session, t0)).toBe(true);
    expect(await consumeSession(id, t0 + SESSION_TTL_S * 1000 + 1)).toBeNull();
  });

  it("unknown session id consumes to null", async () => {
    const { consumeSession } = await import("./reclaim-session");
    expect(await consumeSession("never-bound")).toBeNull();
  });
});

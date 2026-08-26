import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// vitest does not load .env.local, so pull KV_REST_API_* out of it into process.env before the
// lock module reads them. Best-effort: if the file or keys are absent, the test below skips itself.
try {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(KV_REST_API_URL|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const hasUpstash = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

// Real lock against real Upstash. Skips (green) when no KV env is present, so CI without Upstash
// passes. Import lazily inside the block so the module's env read happens after the .env.local load.
describe.skipIf(!hasUpstash)("distributed lock (real Upstash)", () => {
  it("acquires, blocks a second acquire while held, and releases only with the right token", async () => {
    const { acquireLock, releaseLock } = await import("./lock");
    const key = `test:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    const token = await acquireLock(key, 30_000);
    expect(typeof token).toBe("string");
    expect(token).toBeTruthy();

    // Second acquire on the same key while held -> null.
    expect(await acquireLock(key, 30_000)).toBeNull();

    // Wrong token does not free it: the key is still held after.
    await releaseLock(key, "wrong-token");
    expect(await acquireLock(key, 30_000)).toBeNull();

    // Right token frees it: a fresh acquire now succeeds.
    await releaseLock(key, token!);
    const token2 = await acquireLock(key, 30_000);
    expect(token2).toBeTruthy();

    await releaseLock(key, token2!); // clean up
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
// Network boundaries only: the chain reader and the Upstash client are not exercised here.
vi.mock("./note-status", () => ({ noteStatus: vi.fn(), nullifierSpent: vi.fn() }));
vi.mock("./redis", () => ({ redis: () => null }));

import { parseWatch, watchKey, isWatchKey, evaluate, fireWatch, type Watch } from "./push";

const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };
const C = "12345678901234567890";

describe("parseWatch", () => {
  it("accepts a spendable watch on a bare commitment and pins the url to a same-origin path", () => {
    const w = parseWatch({ subscription: sub, watch: { kind: "spendable", commitment: C, url: "https://evil.example/x" } });
    expect(typeof w).toBe("object");
    expect((w as Watch).url).toBe("/"); // absolute URL rejected -> default path, never an open redirect
    expect((w as Watch).nullifier).toBeUndefined();
  });
  it("requires a nullifier for a spent watch and rejects junk", () => {
    expect(parseWatch({ subscription: sub, watch: { kind: "spent", commitment: C } })).toMatch(/nullifier/);
    expect(parseWatch({ subscription: sub, watch: { kind: "spent", commitment: C, nullifier: "0x12" } })).toMatch(/nullifier/);
    expect(parseWatch({ subscription: { endpoint: "http://x", keys: sub.keys }, watch: { kind: "spendable", commitment: C } })).toMatch(/https/);
    expect(parseWatch({ subscription: sub, watch: { kind: "later", commitment: C } })).toMatch(/kind/);
    expect(parseWatch({ subscription: sub, watch: { kind: "spendable", commitment: "abc" } })).toMatch(/commitment/);
    expect(parseWatch(null)).toMatch(/endpoint/);
    const ok = parseWatch({ subscription: sub, watch: { kind: "spent", commitment: C, nullifier: "99", url: "/sender" } }) as Watch;
    expect(ok).toMatchObject({ kind: "spent", commitment: C, nullifier: "99", url: "/sender" });
  });
});

describe("watchKey", () => {
  it("is deterministic per (commitment, kind, endpoint) and round-trips the id check", () => {
    const w = parseWatch({ subscription: sub, watch: { kind: "spendable", commitment: C } }) as Watch;
    const id = watchKey(w);
    expect(id).toBe(watchKey({ commitment: w.commitment, kind: w.kind, sub: { endpoint: w.sub.endpoint } }));
    expect(id.startsWith(`push:${C}:spendable:`)).toBe(true);
    expect(isWatchKey(id)).toBe(true);
    expect(watchKey({ ...w, kind: "spent" })).not.toBe(id);
    expect(watchKey({ ...w, sub: { endpoint: "https://other/e" } })).not.toBe(id);
    expect(isWatchKey("push:1:spendable:zz")).toBe(false);
    expect(isWatchKey("lock:x")).toBe(false);
  });
});

describe("evaluate + fireWatch", () => {
  const base = parseWatch({ subscription: sub, watch: { kind: "spendable", commitment: C, url: "/receiver" } }) as Watch;
  it("fires only on the state the watch waits for", () => {
    expect(evaluate("spendable", { knownLeaf: false, spent: null })).toBeNull();
    expect(evaluate("spendable", { knownLeaf: null, spent: null })).toBeNull(); // chain read failed: no false alarm
    expect(evaluate("spendable", { knownLeaf: true, spent: null })?.title).toMatch(/ready/);
    expect(evaluate("spent", { knownLeaf: true, spent: false })).toBeNull();
    expect(evaluate("spent", { knownLeaf: null, spent: true })?.title).toMatch(/claimed/);
  });
  it("sends the payload with the watch url, keeps on no-change, drops on 410, keeps on other errors", async () => {
    const sent: string[] = [];
    const send = async (_s: unknown, p: string) => { sent.push(p); };
    expect(await fireWatch("id", base, { knownLeaf: false, spent: null }, send)).toBe("kept");
    expect(sent).toHaveLength(0);
    expect(await fireWatch("id", base, { knownLeaf: true, spent: null }, send)).toBe("sent");
    expect(JSON.parse(sent[0])).toMatchObject({ url: "/receiver", kind: "spendable", title: expect.any(String) });
    const gone = async () => { throw Object.assign(new Error("Gone"), { statusCode: 410 }); };
    expect(await fireWatch("id", base, { knownLeaf: true, spent: null }, gone)).toBe("dropped");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const flaky = async () => { throw Object.assign(new Error("Server error"), { statusCode: 500 }); };
    expect(await fireWatch("id", base, { knownLeaf: true, spent: null }, flaky)).toBe("failed");
  });
});

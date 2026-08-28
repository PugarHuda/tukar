import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Sentry surface the logger touches, so the tests assert the mirror calls without a DSN
// or a real client. (With no DSN in production both calls are no-ops inside the SDK.)
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
import * as Sentry from "@sentry/nextjs";
import { log, requestId, errMsg, scrubText, scrubEvent, IGNORE_ERRORS } from "./log";

describe("structured logger", () => {
  beforeEach(() => vi.clearAllMocks());

  it("emits one JSON line with the stable { level, time, msg, ...fields } shape", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("boom", { route: "note-status", reqId: "abc" });
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("boom");
    expect(parsed.route).toBe("note-status");
    expect(parsed.reqId).toBe("abc");
    expect(typeof parsed.time).toBe("string");
    spy.mockRestore();
  });

  it("routes info to stdout and warn/error to stderr", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log.info("i");
    log.warn("w");
    expect(out).toHaveBeenCalledOnce();
    expect(err).toHaveBeenCalledOnce();
    out.mockRestore();
    err.mockRestore();
  });

  it("mirrors error -> Sentry.captureException (route tag, fields as extra) and warn -> breadcrumb", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("write failed", { route: "cron/recurring", err: "disk full" });
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    const [ex, hint] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(ex).toBeInstanceOf(Error);
    expect((ex as Error).message).toBe("write failed");
    expect(hint).toMatchObject({ tags: { route: "cron/recurring" }, extra: { err: "disk full" } });

    const real = new Error("real");
    log.error("wrapped", { err: real });
    expect(vi.mocked(Sentry.captureException).mock.calls[1][0]).toBe(real);

    log.warn("slow", { ms: 900 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({ level: "warning", message: "slow", data: { ms: 900 } }));
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("requestId prefers x-vercel-id, else generates a non-empty id", () => {
    const withHeader = new Request("http://x", { headers: { "x-vercel-id": "iad1::xyz" } });
    expect(requestId(withHeader)).toBe("iad1::xyz");
    expect(requestId(new Request("http://x")).length).toBeGreaterThan(0);
  });

  it("errMsg extracts the message from an Error and stringifies non-errors", () => {
    expect(errMsg(new Error("nope"))).toBe("nope");
    expect(errMsg("plain")).toBe("plain");
  });
});

describe("sentry scrubber", () => {
  const seed = "S" + "A".repeat(55);
  const hex = "ab".repeat(32);
  const dec = "12345678901234567890123";

  it("replaces seeds, 64-hex and >=20-digit decimals but keeps short values", () => {
    expect(scrubText(`seed ${seed} hash ${hex} note ${dec} amount 1000000 tx abc123`)).toBe(
      "seed [seed] hash [hex64] note [bigint] amount 1000000 tx abc123",
    );
  });

  it("scrubs exception values, message, breadcrumbs and extra in place", () => {
    const ev = scrubEvent({
      message: "m " + dec,
      exception: { values: [{ value: "bad nullifier " + hex }] },
      breadcrumbs: [{ message: "b " + seed, data: { nested: { k: hex }, list: [dec, 7] } }],
      extra: { err: "leak " + seed, n: 3 },
    } as any);
    expect(ev.message).toBe("m [bigint]");
    expect(ev.exception!.values![0].value).toBe("bad nullifier [hex64]");
    expect(ev.breadcrumbs![0].message).toBe("b [seed]");
    expect(ev.breadcrumbs![0].data).toEqual({ nested: { k: "[hex64]" }, list: ["[bigint]", 7] });
    expect(ev.extra).toEqual({ err: "leak [seed]", n: 3 });
  });

  it("ignores the wallet user-cancel messages", () => {
    const matches = (msg: string) => IGNORE_ERRORS.some((p) => (typeof p === "string" ? msg.includes(p) : p.test(msg)));
    expect(matches("The user rejected this request.")).toBe(true);
    expect(matches("User declined access")).toBe(true);
    expect(matches("The user closed the modal.")).toBe(true);
    expect(matches("Session closed")).toBe(true);
    expect(matches("simulation failed: HostError")).toBe(false);
  });
});

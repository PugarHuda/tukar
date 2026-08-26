import { describe, it, expect, vi } from "vitest";
import { log, requestId, errMsg } from "./log";

describe("structured logger", () => {
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

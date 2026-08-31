import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Only the network boundary is faked: global fetch, which the SDK's http client calls. The real
// rpc.Server + real interceptor + real failover wrapper run on top of it.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn(), startSpan: vi.fn((_o: unknown, fn: () => unknown) => fn()) }));

import { makeServer, withFailover, isTransientRpcError } from "./rpc";
import { RPC, RPC_FALLBACK } from "../constants";

const healthy = { jsonrpc: "2.0", id: 1, result: { status: "healthy", latestLedger: 1, oldestLedger: 1, ledgerRetentionWindow: 1 } };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let calls: string[];
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
beforeEach(() => {
  calls = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push(String(url));
    return fetchMock(String(url), init);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("makeServer failover", () => {
  it("network error on the primary: retries the same JSON-RPC call once on the fallback", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(RPC)) throw new TypeError("fetch failed");
      return json(healthy);
    });
    const res = await makeServer().getHealth();
    expect(res.status).toBe("healthy");
    expect(calls).toHaveLength(2);
    expect(calls[0].startsWith(RPC)).toBe(true);
    expect(calls[1].startsWith(RPC_FALLBACK)).toBe(true);
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toContain("soroban rpc failover");
  });

  it("5xx on the primary: fails over; 4xx does not", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.startsWith(RPC) ? json({ error: "bad gateway" }, 502) : json(healthy)));
    expect((await makeServer().getHealth()).status).toBe("healthy");
    expect(calls.map((u) => u.startsWith(RPC_FALLBACK))).toEqual([false, true]);

    calls = [];
    fetchMock.mockImplementation(async () => json({ error: "nope" }, 404));
    await expect(makeServer().getHealth()).rejects.toThrow(/404/);
    expect(calls).toHaveLength(1);
  });

  it("goes back to the primary on the next call after a failover", async () => {
    let primaryDown = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith(RPC) && primaryDown) throw new TypeError("fetch failed");
      return json(healthy);
    });
    const s = makeServer();
    await s.getHealth();
    primaryDown = false;
    await s.getHealth();
    expect(calls.map((u) => u.startsWith(RPC_FALLBACK))).toEqual([false, true, false]);
  });

  it("fallback failing too surfaces the fallback error (one retry only)", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(makeServer().getHealth()).rejects.toThrow("fetch failed");
    expect(calls).toHaveLength(2);
  });

  it("only the primary RPC host is failed over (friendbot etc. untouched)", async () => {
    const seen: string[] = [];
    const fake = { post: async (url: string) => { seen.push(url); throw new TypeError("fetch failed"); } };
    withFailover(fake, "https://primary.test", "https://fallback.test");
    await expect(fake.post("https://friendbot.test/?addr=G")).rejects.toThrow("fetch failed");
    expect(seen).toEqual(["https://friendbot.test/?addr=G"]);
    await expect(fake.post("https://primary.test/")).rejects.toThrow();
    expect(seen.slice(1)).toEqual(["https://primary.test/", "https://fallback.test/"]);
  });

  it("isTransientRpcError: no response or 5xx yes, 4xx no", () => {
    expect(isTransientRpcError(new Error("timeout of 30000ms exceeded"))).toBe(true);
    expect(isTransientRpcError({ response: { status: 503 } })).toBe(true);
    expect(isTransientRpcError({ response: { status: 429 } })).toBe(false);
  });
});

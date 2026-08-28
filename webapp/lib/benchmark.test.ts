import { describe, it, expect, vi, afterEach } from "vitest";
import { isoDurationHours, mapComparison, fetchBenchmark } from "./benchmark";

// Trimmed from a real GET https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=MXN&sendAmount=200
// (2026-08-27). Only the fields the mapper reads are kept; logos etc. dropped.
const WISE_MXN = {
  amount: 200,
  providers: [
    { name: "Wise", alias: "wise", quotes: [{ fee: 8.09, rate: 16.9695, markup: 0, receivedAmount: 3256.62, deliveryEstimation: { duration: { min: "PT30M4S", max: "PT30M4S" } } }] },
    { name: "WorldRemit", alias: "world-remit", quotes: [{ fee: 1.99, rate: 16.5815880794, markup: 2.285, receivedAmount: 3283.32, deliveryEstimation: { duration: null } }] },
    { name: "Wells Fargo", alias: "wells-fargo", quotes: [{ fee: 0, rate: 16.4363198762, markup: 3.14, receivedAmount: 3287.26, deliveryEstimation: { duration: null } }] },
    { name: "Broken", alias: "broken", quotes: [] },
    { name: "NoAmount", alias: "no-amount", quotes: [{ fee: 1, rate: 16 }] },
  ],
};

describe("isoDurationHours", () => {
  it("parses hours, minutes, seconds and days", () => {
    expect(isoDurationHours("PT30M4S")).toBe(0.5);
    expect(isoDurationHours("PT6H9M6S")).toBe(6.2);
    expect(isoDurationHours("P1DT2H")).toBe(26);
  });
  it("returns null for missing or malformed input", () => {
    expect(isoDurationHours(null)).toBeNull();
    expect(isoDurationHours("soon")).toBeNull();
  });
});

describe("mapComparison", () => {
  it("maps each provider's quote and sorts by receivedAmount, best first", () => {
    const out = mapComparison(WISE_MXN);
    expect(out.map((p) => p.name)).toEqual(["Wells Fargo", "WorldRemit", "Wise"]);
    expect(out[2]).toEqual({ name: "Wise", fee: 8.09, rate: 16.9695, receivedAmount: 3256.62, deliveryHours: 0.5 });
    expect(out[0].deliveryHours).toBeNull();
  });
  it("drops providers without a usable quote and tolerates a non-object payload", () => {
    expect(mapComparison(WISE_MXN).some((p) => p.name === "Broken" || p.name === "NoAmount")).toBe(false);
    expect(mapComparison(null)).toEqual([]);
    expect(mapComparison({ errors: ["Invalid currency"] })).toEqual([]);
  });
});

describe("fetchBenchmark", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns mapped providers and serves the second call from cache", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(WISE_MXN), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const a = await fetchBenchmark("MXN", 200);
    expect(a.providers.length).toBe(3);
    expect(a.reason).toBeUndefined();
    const b = await fetchBenchmark("MXN", 200);
    expect(b).toBe(a);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("sourceCurrency=USD&targetCurrency=MXN&sendAmount=200");
  });

  it("reports an unsupported currency honestly (upstream 400) instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: ["Invalid currency 'XXX'"] }), { status: 400 })));
    const r = await fetchBenchmark("XXX", 200);
    expect(r.providers).toEqual([]);
    expect(r.reason).toBe("no benchmark for XXX");
  });

  it("throws on an upstream failure so the route can answer 502", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    await expect(fetchBenchmark("BRL", 50)).rejects.toThrow(/503/);
  });
});

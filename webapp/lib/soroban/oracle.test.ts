import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ONLY the RPC simulate boundary (and the Sentry surface the logger touches). Everything
// else under test is the real oracle module, re-imported fresh per test so its caches start empty.
vi.mock("./rpc", () => ({ simulate: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn(), startSpan: vi.fn((_o: unknown, fn: () => unknown) => fn()) }));

type Sim = (contract: string, method: string, ...args: unknown[]) => Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>;

async function fresh(handler: Sim) {
  vi.resetModules();
  const rpc = await import("./rpc");
  vi.mocked(rpc.simulate).mockReset().mockImplementation(handler as any);
  const oracle = await import("./oracle");
  return { oracle, simulate: vi.mocked(rpc.simulate) };
}

// Real clock (fake timers stall vitest's dynamic module import); ages are relative to test start.
const NOW = Math.floor(Date.now() / 1000); // epoch seconds
const ok = (value: unknown) => ({ ok: true as const, value });
const err = (error = "rpc down") => ({ ok: false as const, error });
// price is USD per local unit scaled 10^decimals; with decimals=14 price 5e13 -> rate 2
const lastprice = (price: bigint, timestamp = NOW) => ok({ price, timestamp: BigInt(timestamp) });

// Each test re-imports the oracle module, which pulls the whole Stellar SDK; on a loaded machine
// (the e2e suites running alongside) that import alone can pass the 5 s default.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("decimals cache", () => {
  it("uses fallback 14 on failure WITHOUT caching it, then caches the real value on success", async () => {
    let decimalsCalls = 0;
    const { oracle, simulate } = await fresh(async (_c, m) => {
      if (m === "decimals") return ++decimalsCalls === 1 ? err() : ok(7);
      if (m === "resolution") return err();
      if (m === "lastprice") return decimalsCalls === 1 ? lastprice(5n * 10n ** 13n) : lastprice(5n * 10n ** 6n);
      throw new Error("unexpected " + m);
    });
    // 1st read: decimals fails -> fallback 14 -> 1e14 / 5e13 = 2
    expect((await oracle.readReflectorFx("MXN"))?.rate).toBe(2);
    // 2nd read: decimals retried (not pinned to 14) -> 7 -> 1e7 / 5e6 = 2
    expect((await oracle.readReflectorFx("MXN"))?.rate).toBe(2);
    // 3rd read: the successful value is cached; no further decimals call
    await oracle.readReflectorFx("MXN");
    expect(simulate.mock.calls.filter(([, m]) => m === "decimals")).toHaveLength(2);
  });
});

describe("lastOracleError", () => {
  it("is set on a failed read and cleared by the next successful one", async () => {
    let fail = true;
    const { oracle } = await fresh(async (_c, m) => {
      if (m === "decimals") return ok(14);
      if (m === "resolution") return ok(300);
      if (m === "lastprice") return fail ? err("simulation failed") : lastprice(5n * 10n ** 13n);
      throw new Error("unexpected " + m);
    });
    expect(oracle.lastOracleError()).toBeNull();
    expect(await oracle.readReflectorFx("MXN")).toBeNull();
    expect(oracle.lastOracleError()?.reason).toMatch(/lastprice read failed/);
    fail = false;
    expect((await oracle.readReflectorFx("MXN"))?.rate).toBe(2);
    expect(oracle.lastOracleError()).toBeNull();
  });
});

describe("staleness window", () => {
  it("is resolution*3 when the oracle reports one, else 3600s", async () => {
    const withRes = await fresh(async (_c, m) => {
      if (m === "decimals") return ok(14);
      if (m === "resolution") return ok(300);
      if (m === "lastprice") return lastprice(5n * 10n ** 13n, NOW - 1000); // 1000s old
      throw new Error("unexpected " + m);
    });
    expect(await withRes.oracle.readReflectorFx("MXN")).toBeNull(); // 1000 > 900
    expect(withRes.oracle.lastOracleError()?.reason).toMatch(/stale/);

    const noRes = await fresh(async (_c, m) => {
      if (m === "decimals") return ok(14);
      if (m === "resolution") return err();
      if (m === "lastprice") return lastprice(5n * 10n ** 13n, NOW - 1000);
      throw new Error("unexpected " + m);
    });
    expect((await noRes.oracle.readReflectorFx("MXN"))?.rate).toBe(2); // 1000 < 3600
  });

  it("caches resolution for an hour but retries after a failure", async () => {
    let resCalls = 0;
    const { oracle, simulate } = await fresh(async (_c, m) => {
      if (m === "resolution") return ++resCalls === 1 ? err() : ok(300);
      throw new Error("unexpected " + m);
    });
    expect(await oracle.oracleResolution()).toBeNull();
    expect(await oracle.oracleResolution()).toBe(300);
    expect(await oracle.oracleResolution()).toBe(300);
    expect(simulate).toHaveBeenCalledTimes(2);
  });
});

describe("oracleAssets / oracleTwap", () => {
  it("maps the [variant, payload] tuples to codes and caches the list", async () => {
    const { oracle, simulate } = await fresh(async (_c, m) => {
      if (m === "assets") return ok([["Other", "EUR"], ["Other", "MXN"], ["Stellar", "CABC"]]);
      throw new Error("unexpected " + m);
    });
    expect(await oracle.oracleAssets()).toEqual(["EUR", "MXN", "CABC"]);
    expect(await oracle.oracleAssets()).toEqual(["EUR", "MXN", "CABC"]);
    expect(simulate).toHaveBeenCalledTimes(1);
  });

  it("twap is the mean PRICE over the records, inverted to local-per-USD", async () => {
    const { oracle } = await fresh(async (_c, m) => {
      if (m === "decimals") return ok(14);
      if (m === "prices")
        return ok([
          { price: 4n * 10n ** 13n, timestamp: BigInt(NOW) }, // rate 2.5
          { price: 6n * 10n ** 13n, timestamp: BigInt(NOW - 300) }, // rate 1.666
          { price: 0n, timestamp: BigInt(NOW - 600) }, // skipped
        ]);
      throw new Error("unexpected " + m);
    });
    const t = await oracle.oracleTwap("MXN", 3);
    expect(t?.records).toBe(2);
    expect(t?.rate).toBeCloseTo(1e14 / 5e13, 10); // mean price 5e13 -> rate 2
  });
});

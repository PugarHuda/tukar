import { describe, it, expect, vi, beforeEach } from "vitest";

// Only the network boundary is mocked: the Blend SDK's ledger loads (PoolV2.load / loadUser) and
// the wallet/RPC modules blend.ts signs through. The result-type mapping under test is real.
const sdk = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@blend-capital/blend-sdk", async (orig) => {
  const real: any = await orig();
  return { ...real, PoolV2: { load: sdk.load } };
});
vi.mock("./stellar", () => ({ walletSigner: () => null, activeAddress: () => "GADDR" }));
vi.mock("./soroban/rpc", () => ({ server: {} }));

import { RequestType, I128MAX } from "@blend-capital/blend-sdk";
import { readBlend, withdrawRequests, poolStatusLabel, supplyAllowed, BLEND_USDC } from "./blend";

const reserve = {
  estSupplyApy: 0.0412,
  supplyApr: 0.0404,
  totalSupplyFloat: () => 12345.6,
  getUtilizationFloat: () => 0.63,
  supplyEmissions: { eps: 1n },
};
const user = (supplyB: bigint, collB: bigint, blnd = 0) => ({
  getSupplyBTokens: () => supplyB,
  getCollateralBTokens: () => collB,
  getSupplyFloat: () => Number(supplyB) / 1e7,
  getCollateralFloat: () => Number(collB) / 1e7,
  estimateEmissions: () => ({ emissions: blnd, claimedTokens: blnd > 0 ? [3] : [] }),
});
const pool = (status: number, u = user(0n, 0n)) => ({
  metadata: { status },
  reserves: new Map([[BLEND_USDC, reserve]]),
  loadUser: async () => u,
});

beforeEach(() => sdk.load.mockReset());

describe("readBlend result mapping", () => {
  it("maps pool facts without an address", async () => {
    sdk.load.mockResolvedValue(pool(1));
    const r = await readBlend();
    expect(r).toEqual({ ok: true, supplyApy: 0.0412, supplyApr: 0.0404, totalSuppliedUsdc: 12345.6, utilization: 0.63, poolStatus: 1, supplyOpen: true });
  });

  it("maps a position: supply + legacy collateral sides, value, claimable BLND", async () => {
    sdk.load.mockResolvedValue(pool(0, user(50_000_000n, 20_000_000n, 1.25)));
    const r = await readBlend("GADDR");
    expect(r.ok).toBe(true);
    if (!r.ok || !("bTokens" in r)) throw new Error("expected a position");
    expect(r.bTokens).toBe("50000000");
    expect(r.collateralBTokens).toBe("20000000");
    expect(r.valueUsdc).toBeCloseTo(7);
    expect(r.claimableBlnd).toBe(1.25);
    expect(r.claimTokenIds).toEqual([3]);
    expect(r.emissionsActive).toBe(true);
  });

  it("a never-supplied address reads back zeros, still ok:true", async () => {
    sdk.load.mockResolvedValue(pool(0));
    const r = await readBlend("GADDR");
    expect(r.ok && "valueUsdc" in r && r.valueUsdc).toBe(0);
  });

  it("returns { ok:false, reason } and logs when the chain read fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sdk.load.mockResolvedValue({ ...pool(0), loadUser: () => Promise.reject(new Error("rpc timeout")) });
    const r = await readBlend("GADDR");
    expect(r).toEqual({ ok: false, reason: "rpc timeout" });
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: "error", msg: "blend read failed", err: "rpc timeout" });
    spy.mockRestore();
  });

  it("a pool without the USDC reserve is a read failure, not a zero balance", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sdk.load.mockResolvedValue({ metadata: { status: 0 }, reserves: new Map() });
    const r = await readBlend("GADDR");
    expect(r.ok).toBe(false);
    vi.restoreAllMocks();
  });

  it("gates supply on the pool status (frozen / setup reject supplies)", async () => {
    sdk.load.mockResolvedValue(pool(4));
    const r = await readBlend();
    expect(r.ok).toBe(true);
    expect(r.ok && r.supplyOpen).toBe(false);
  });
});

describe("pool status", () => {
  it("labels the contract codes and allows supply only up to on-ice", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(poolStatusLabel)).toEqual(["active", "active", "on-ice", "on-ice", "frozen", "frozen", "setup"]);
    expect([0, 1, 2, 3].every(supplyAllowed)).toBe(true);
    expect([4, 5, 6].some(supplyAllowed)).toBe(false);
  });
});

describe("withdrawRequests", () => {
  it("withdraws only the sides that exist, non-collateral first", () => {
    expect(withdrawRequests(0n, 0n)).toEqual([]);
    expect(withdrawRequests(5n, 0n).map((r) => r.request_type)).toEqual([RequestType.Withdraw]);
    expect(withdrawRequests(0n, 5n).map((r) => r.request_type)).toEqual([RequestType.WithdrawCollateral]);
    expect(withdrawRequests(5n, 5n).map((r) => r.request_type)).toEqual([RequestType.Withdraw, RequestType.WithdrawCollateral]);
    expect(withdrawRequests(5n, 5n).every((r) => r.amount === I128MAX && r.address === BLEND_USDC)).toBe(true);
  });

  it("a partial amount comes from the supply side, or collateral when that is the only side", () => {
    expect(withdrawRequests(5n, 5n, 3n)).toEqual([{ request_type: RequestType.Withdraw, address: BLEND_USDC, amount: 3n }]);
    expect(withdrawRequests(0n, 5n, 3n)).toEqual([{ request_type: RequestType.WithdrawCollateral, address: BLEND_USDC, amount: 3n }]);
  });
});

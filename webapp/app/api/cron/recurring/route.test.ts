import { describe, it, expect, vi, beforeEach } from "vitest";

// A scheduled run must spend the OWNER's USDC (pulled under the allowance they signed), never the
// relayer's. Store, relayer, oracle, prover and lock are mocked at their module boundary; the
// route's own decision logic runs for real.
const OWNER = "G" + "A".repeat(55);
const RELAYER = "G" + "R".repeat(55);
const file = vi.hoisted(() => ({ current: null as any }));

vi.mock("@sentry/nextjs", () => ({ withMonitor: (_: string, fn: () => unknown) => fn() }));
vi.mock("@/lib/lock", () => ({ withLock: async (_k: string, _t: number, fn: () => Promise<unknown>) => ({ ran: true, result: await fn() }) }));
vi.mock("@/lib/soroban/oracle", () => ({ readReflectorFx: vi.fn() }));
vi.mock("@/lib/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedules")>();
  return {
    ...actual,
    isConfigured: () => true,
    listAllOwners: async () => [OWNER],
    readOwnerFile: async () => structuredClone(file.current),
    writeOwnerFile: vi.fn(async (_o: string, f: any) => {
      file.current = structuredClone(f);
    }),
  };
});
vi.mock("@/lib/zk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/zk")>();
  return { ...actual, newNote: vi.fn(async (amount: bigint) => ({ commitment: "1", amount: amount.toString(), pubKey: "2", blinding: "3", privKey: "4" })), encodeBearerNote: () => "tukar1:note" };
});
vi.mock("@/lib/relayer", () => ({
  RELAYER_NOT_CONFIGURED: "scheduler relayer key not configured (RELAYER_SECRET)",
  relayerConfigured: vi.fn(() => true),
  relayerAddress: () => RELAYER,
  readAllowance: vi.fn(),
  readUsdcBalance: vi.fn(),
  pullFromOwner: vi.fn(),
  refundOwner: vi.fn(),
  relayerDeposit: vi.fn(),
  relayerRegister: vi.fn(),
}));

import { GET } from "./route";
import * as relayer from "@/lib/relayer";

const SECRET = "cron-secret-0123456789";
const call = async () => {
  const res = await GET(new Request("https://x/api/cron/recurring", { headers: { authorization: `Bearer ${SECRET}` } }));
  return { status: res.status, body: await res.json() };
};
const today = new Date().toISOString().slice(0, 10);
const plan = (extra: object = {}) => ({ id: "p1", amount: "10", code: "MX", recipient: "Ana", frequency: "weekly", nextDate: today, history: [], ...extra });

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  vi.mocked(relayer.relayerConfigured).mockReturnValue(true);
  for (const f of ["readAllowance", "readUsdcBalance", "pullFromOwner", "refundOwner", "relayerDeposit", "relayerRegister"] as const) vi.mocked(relayer[f]).mockReset();
  file.current = { plans: [plan({ approval: { hash: "ab".repeat(32), spender: RELAYER, amount: "40", expirationLedger: 999 } })], guard: {} };
});

describe("GET /api/cron/recurring", () => {
  it("holds the plan and moves no money when the allowance is short", async () => {
    vi.mocked(relayer.readAllowance).mockResolvedValue(5n * 10_000_000n); // 5 USDC left, run needs 10
    vi.mocked(relayer.readUsdcBalance).mockResolvedValue(100n * 10_000_000n);
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.processed).toBe(0);
    expect(relayer.pullFromOwner).not.toHaveBeenCalled();
    expect(relayer.relayerDeposit).not.toHaveBeenCalled();
    const p = file.current.plans[0];
    expect(p.nextDate).toBe(today); // still due, re-checked tomorrow
    expect(p.history[0].skipped).toMatch(/allowance short: 5\.00 USDC approved .*ledger 999.*needs 10/);
  });

  it("holds when the owner's balance is short", async () => {
    vi.mocked(relayer.readAllowance).mockResolvedValue(40n * 10_000_000n);
    vi.mocked(relayer.readUsdcBalance).mockResolvedValue(1n);
    await call();
    expect(relayer.pullFromOwner).not.toHaveBeenCalled();
    expect(file.current.plans[0].history[0].skipped).toMatch(/balance short/);
  });

  it("pulls the owner's USDC before depositing, and records the pull", async () => {
    vi.mocked(relayer.readAllowance).mockResolvedValue(40n * 10_000_000n);
    vi.mocked(relayer.readUsdcBalance).mockResolvedValue(40n * 10_000_000n);
    vi.mocked(relayer.pullFromOwner).mockResolvedValue({ ok: true, hash: "pull" });
    vi.mocked(relayer.relayerDeposit).mockResolvedValue({ ok: true, hash: "dep" });
    vi.mocked(relayer.relayerRegister).mockResolvedValue({ ok: true });
    const r = await call();
    expect(r.body).toMatchObject({ processed: 1, depositOk: true });
    expect(relayer.pullFromOwner).toHaveBeenCalledWith(OWNER, 100_000_000n);
    expect(vi.mocked(relayer.pullFromOwner).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(relayer.relayerDeposit).mock.invocationCallOrder[0]);
    expect(file.current.plans[0].history[0]).toMatchObject({ pullHash: "pull", depHash: "dep", regOk: true });
  });

  it("does not deposit when the pull fails, and refunds when the deposit fails after a pull", async () => {
    vi.mocked(relayer.readAllowance).mockResolvedValue(40n * 10_000_000n);
    vi.mocked(relayer.readUsdcBalance).mockResolvedValue(40n * 10_000_000n);
    vi.mocked(relayer.pullFromOwner).mockResolvedValueOnce({ ok: false, error: "insufficient allowance" });
    await call();
    expect(relayer.relayerDeposit).not.toHaveBeenCalled();
    expect(file.current.plans[0].history[0].error).toMatch(/could not pull 10 USDC/);

    file.current.plans[0].nextDate = today;
    vi.mocked(relayer.pullFromOwner).mockResolvedValueOnce({ ok: true, hash: "pull" });
    vi.mocked(relayer.relayerDeposit).mockResolvedValueOnce({ ok: false, error: "deposit reverted" });
    vi.mocked(relayer.refundOwner).mockResolvedValueOnce({ ok: true, hash: "back" });
    await call();
    expect(relayer.refundOwner).toHaveBeenCalledWith(OWNER, 100_000_000n);
    expect(file.current.plans[0].history[0]).toMatchObject({ pullHash: "pull", refundHash: "back", error: "deposit reverted" });
  });

  it("answers 503 naming RELAYER_SECRET and touches nothing when no private relayer key is set", async () => {
    vi.mocked(relayer.relayerConfigured).mockReturnValue(false);
    const r = await call();
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("scheduler relayer key not configured (RELAYER_SECRET)");
    expect(relayer.readAllowance).not.toHaveBeenCalled();
    expect(relayer.pullFromOwner).not.toHaveBeenCalled();
  });
});

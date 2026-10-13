import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Sdk from "@stellar/stellar-sdk";
import { PASSPHRASE, POOL } from "@/lib/constants";

// Plans are reminders the owner signs: no relayer key gates them, and marking a run done is accepted
// only for a deposit the network shows came from the owner's own wallet with the plan amount.
// The store and the RPC getTransaction are mocked; lib/schedules' verification runs for real.
const OWNER = Sdk.Keypair.random().publicKey();
const OTHER = Sdk.Keypair.random().publicKey();
vi.mock("@/lib/auth", () => ({ authOwner: () => OWNER, isAuthConfigured: () => true, issueNonce: () => "n", issueToken: async () => "t" }));
const store = vi.hoisted(() => ({ file: null as any, write: vi.fn() }));
const rpc = vi.hoisted(() => ({ getTransaction: vi.fn() }));
vi.mock("@/lib/soroban/rpc", async (importOriginal) => ({ ...(await importOriginal<any>()), server: rpc }));
vi.mock("@/lib/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedules")>();
  return {
    ...actual,
    isConfigured: () => true,
    readOwnerFile: async () => structuredClone(store.file),
    writeOwnerFile: store.write.mockImplementation(async (_o: string, f: any) => {
      store.file = structuredClone(f);
    }),
  };
});

import { POST } from "./route";
import { GET as probe } from "./nonce/route";

const post = async (body: object) => {
  const res = await POST(new Request("https://x/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const today = new Date().toISOString().slice(0, 10);
const HASH = "ab".repeat(32);
const depositTx = (source: string, stroops: bigint) => ({
  status: "SUCCESS",
  createdAt: Math.floor(Date.now() / 1000),
  envelopeXdr: new Sdk.TransactionBuilder(new Sdk.Account(source, "1"), { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.invokeContractFunction({ contract: POOL, function: "deposit", args: [Sdk.nativeToScVal(source, { type: "address" }), Sdk.nativeToScVal(stroops, { type: "i128" })] }))
    .setTimeout(60)
    .build()
    .toEnvelope(),
});

beforeEach(() => {
  delete process.env.RELAYER_SECRET;
  store.write.mockClear();
  rpc.getTransaction.mockReset();
  store.file = { plans: [{ id: "p1", amount: "10", code: "MX", recipient: "Ana", frequency: "weekly", nextDate: today, history: [] }], guard: {} };
});

describe("POST /api/schedules (create)", () => {
  it("stores a plan with no relayer key and no approval", async () => {
    store.file = { plans: [], guard: {} };
    const r = await post({ amount: "10", code: "MX", recipient: "Ana", frequency: "weekly" });
    expect(r.status).toBe(200);
    expect(r.body.schedule).toMatchObject({ amount: "10", code: "MX", frequency: "weekly", history: [] });
    expect(r.body.schedule).not.toHaveProperty("approval");
    expect(store.file.plans).toHaveLength(1);
  });

  it("the nonce probe is live with the store + AUTH_SECRET alone and hands out no relayer", async () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    const body = await (await probe(new Request("https://x/api/schedules/nonce"))).json();
    expect(body).toEqual({ configured: true });
  });
});

describe("POST /api/schedules (mark a run done)", () => {
  it("records the owner's own deposit of the plan amount and advances the plan", async () => {
    rpc.getTransaction.mockResolvedValue(depositTx(OWNER, 100_000_000n));
    const r = await post({ id: "p1", txHash: HASH });
    expect(r.status).toBe(200);
    expect(rpc.getTransaction).toHaveBeenCalledWith(HASH);
    expect(store.file.plans[0].history[0]).toMatchObject({ depHash: HASH });
    expect(store.file.plans[0].nextDate > today).toBe(true);
    // the same hash can never settle a second run
    const again = await post({ id: "p1", txHash: HASH });
    expect(again.status).toBe(409);
  });

  it("rejects a transaction from another source", async () => {
    rpc.getTransaction.mockResolvedValue(depositTx(OTHER, 100_000_000n));
    const r = await post({ id: "p1", txHash: HASH });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/not sent from your wallet/);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects a deposit of the wrong amount", async () => {
    rpc.getTransaction.mockResolvedValue(depositTx(OWNER, 50_000_000n));
    const r = await post({ id: "p1", txHash: HASH });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/amount does not match/);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("rejects a failed / missing / stale transaction and a malformed hash", async () => {
    rpc.getTransaction.mockResolvedValueOnce({ status: "FAILED" });
    expect((await post({ id: "p1", txHash: HASH })).status).toBe(400);
    rpc.getTransaction.mockResolvedValueOnce({ status: "NOT_FOUND" });
    expect((await post({ id: "p1", txHash: HASH })).body.error).toMatch(/not found/);
    rpc.getTransaction.mockResolvedValueOnce({ ...depositTx(OWNER, 100_000_000n), createdAt: Math.floor(Date.now() / 1000) - 30 * 86400 });
    expect((await post({ id: "p1", txHash: HASH })).body.error).toMatch(/older than this run/);
    expect((await post({ id: "p1", txHash: "nope" })).status).toBe(400);
    expect(store.write).not.toHaveBeenCalled();
  });
});

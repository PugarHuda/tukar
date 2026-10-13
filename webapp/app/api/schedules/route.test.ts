import { describe, it, expect, vi, beforeEach } from "vitest";

// A plan grants the relayer an allowance over the owner's USDC, so the spender must be a PRIVATE
// key. With no RELAYER_SECRET (or with it set to the published demo key) the scheduler must answer
// 503 naming the env var, and never hand out a spender address. lib/relayer runs for real here.
const OWNER = "G" + "A".repeat(55);
vi.mock("@/lib/auth", () => ({ authOwner: () => OWNER, isAuthConfigured: () => true, issueNonce: () => "n", issueToken: async () => "t" }));
const store = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("@/lib/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedules")>();
  return { ...actual, isConfigured: () => true, readOwnerFile: async () => ({ plans: [], guard: {} }), writeOwnerFile: store.write };
});

import { POST } from "./route";
import { GET as probe } from "./nonce/route";
import { DEMO_SECRET } from "@/lib/constants";

const MSG = "scheduler relayer key not configured (RELAYER_SECRET)";
const post = async () => {
  const res = await POST(new Request("https://x/api/schedules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount: "10", code: "MX", recipient: "Ana", frequency: "weekly" }) }));
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  delete process.env.RELAYER_SECRET;
  delete process.env.STELLAR_RELAYER_SECRET;
  store.write.mockReset();
});

describe("scheduler without a private relayer key", () => {
  it.each([
    ["unset", undefined],
    ["the public demo key", DEMO_SECRET],
  ])("POST /api/schedules answers 503 when RELAYER_SECRET is %s, and saves nothing", async (_, secret) => {
    if (secret) process.env.RELAYER_SECRET = secret;
    const r = await post();
    expect(r.status).toBe(503);
    expect(r.body.error).toBe(MSG);
    expect(store.write).not.toHaveBeenCalled();
  });

  it("the nonce probe reports RELAYER_SECRET in `missing` (200, it is a page-load capability read) and no relayer address", async () => {
    const res = await probe(new Request("https://x/api/schedules/nonce"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ configured: false, error: MSG });
    expect(body.missing).toContain("RELAYER_SECRET");
    expect(body.relayer).toBeUndefined();
  });

  it("wallet sign-in still issues a nonce without the relayer key (the regulator's TRP lifecycle read uses it)", async () => {
    const res = await probe(new Request("https://x/api/schedules/nonce?address=" + OWNER));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ configured: true, nonce: "n" });
  });
});

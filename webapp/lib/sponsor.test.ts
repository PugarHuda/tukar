import { describe, it, expect, afterEach } from "vitest";
import * as Sdk from "@stellar/stellar-sdk";
import { validateInner, feeBump, sponsorKeypair, USDC_SAC, MAX_RESOURCE_FEE, SPONSOR_NOT_CONFIGURED } from "./sponsor";
import { POOL, DEMO_SECRET } from "./constants";
import { GET, POST } from "@/app/api/sponsor/route";

const user = Sdk.Keypair.random();
const b32 = () => Sdk.nativeToScVal(Buffer.alloc(32, 7));

function build(opts: { contract?: string; fn?: string; ops?: number; passphrase?: string; resourceFee?: number; fee?: number; sign?: boolean } = {}) {
  const { contract = POOL, fn = "deposit", ops = 1, passphrase = Sdk.Networks.TESTNET, resourceFee = 186_912_449, fee, sign = true } = opts;
  const b = new Sdk.TransactionBuilder(new Sdk.Account(user.publicKey(), "41"), { fee: String(fee ?? 100), networkPassphrase: passphrase }); // build() adds the resource fee on top
  for (let i = 0; i < ops; i++) {
    b.addOperation(new Sdk.Contract(contract).call(fn, Sdk.nativeToScVal(user.publicKey(), { type: "address" }), Sdk.nativeToScVal(10_000_000n, { type: "i128" }), b32()));
  }
  const tx = b.setSorobanData(new Sdk.SorobanDataBuilder().setResourceFee(resourceFee).build()).setTimeout(120).build();
  if (sign) tx.sign(user);
  return tx.toXDR();
}

describe("validateInner", () => {
  it("accepts a signed pool deposit and fee-bumps it at the inner rate", () => {
    const v = validateInner(build());
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v).toMatchObject({ source: user.publicKey(), contract: POOL, fn: "deposit", inclusionFee: 100n, resourceFee: 186_912_449n });
    const sponsor = Sdk.Keypair.random();
    const fb = feeBump(sponsor, v);
    expect(fb.feeSource).toBe(sponsor.publicKey());
    expect(fb.innerTransaction.source).toBe(user.publicKey());
    expect(BigInt(fb.fee)).toBe(186_912_449n + 200n);
  });

  it("accepts the shielded-tree registration and the USDC SAC approve", () => {
    expect(validateInner(build({ fn: "register_root_verified" })).ok).toBe(true);
    expect(validateInner(build({ contract: USDC_SAC, fn: "approve" })).ok).toBe(true);
  });

  const reason = (x: ReturnType<typeof validateInner>) => (x.ok ? "" : x.reason);

  it("rejects the wrong contract", () => {
    const other = Sdk.StrKey.encodeContract(Buffer.alloc(32, 9));
    expect(reason(validateInner(build({ contract: other })))).toMatch(/not sponsorable/);
  });
  it("rejects a function outside the allowlist", () => {
    expect(reason(validateInner(build({ fn: "withdraw" })))).toMatch(/"withdraw" is not sponsorable/);
    expect(reason(validateInner(build({ contract: USDC_SAC, fn: "transfer" })))).toMatch(/"transfer" is not sponsorable/);
  });
  it("rejects multiple operations", () => {
    expect(reason(validateInner(build({ ops: 2 })))).toMatch(/exactly one operation/);
  });
  it("rejects the mainnet passphrase, and a tx signed for mainnet", () => {
    expect(reason(validateInner(build(), Sdk.Networks.PUBLIC))).toMatch(/testnet/);
    expect(reason(validateInner(build({ passphrase: Sdk.Networks.PUBLIC })))).toMatch(/not signed by its source/);
  });
  it("rejects an unsigned inner, and one signed by someone else", () => {
    expect(reason(validateInner(build({ sign: false })))).toMatch(/not signed by its source/);
    const tx = Sdk.TransactionBuilder.fromXDR(build({ sign: false }), Sdk.Networks.TESTNET) as Sdk.Transaction;
    tx.sign(Sdk.Keypair.random());
    expect(reason(validateInner(tx.toXDR()))).toMatch(/not signed by its source/);
  });
  it("rejects oversized fees", () => {
    expect(reason(validateInner(build({ resourceFee: Number(MAX_RESOURCE_FEE) + 1 })))).toMatch(/resource fee .* exceeds/);
    expect(reason(validateInner(build({ resourceFee: 1000, fee: 100_001 })))).toMatch(/inclusion fee .* exceeds/);
  });
  it("rejects a classic op, a fee-bump envelope and garbage", () => {
    const classic = new Sdk.TransactionBuilder(new Sdk.Account(user.publicKey(), "1"), { fee: "100", networkPassphrase: Sdk.Networks.TESTNET })
      .addOperation(Sdk.Operation.payment({ destination: user.publicKey(), asset: Sdk.Asset.native(), amount: "1" }))
      .setTimeout(60)
      .build();
    classic.sign(user);
    expect(reason(validateInner(classic.toXDR()))).toMatch(/invokeHostFunction/);
    const v = validateInner(build());
    if (!v.ok) throw new Error("setup");
    expect(reason(validateInner(feeBump(Sdk.Keypair.random(), v).toXDR()))).toMatch(/already a fee-bump/);
    expect(reason(validateInner("not-xdr"))).toMatch(/not a valid/);
    expect(reason(validateInner(undefined))).toMatch(/base64/);
  });
});

describe("sponsor key + 503 paths", () => {
  const saved = { s: process.env.SPONSOR_SECRET, r: process.env.RELAYER_SECRET };
  afterEach(() => {
    process.env.SPONSOR_SECRET = saved.s;
    process.env.RELAYER_SECRET = saved.r;
    if (saved.s === undefined) delete process.env.SPONSOR_SECRET;
    if (saved.r === undefined) delete process.env.RELAYER_SECRET;
  });

  it("never uses the published demo key", () => {
    expect(sponsorKeypair({})).toBeNull();
    expect(sponsorKeypair({ SPONSOR_SECRET: DEMO_SECRET })).toBeNull();
    expect(sponsorKeypair({ RELAYER_SECRET: DEMO_SECRET })).toBeNull();
    const k = Sdk.Keypair.random();
    expect(sponsorKeypair({ RELAYER_SECRET: k.secret() })?.publicKey()).toBe(k.publicKey());
  });

  it("GET reports unavailable (200) and POST answers 503 with the missing env var when unset or the demo key", async () => {
    for (const val of [undefined, DEMO_SECRET]) {
      delete process.env.RELAYER_SECRET;
      if (val === undefined) delete process.env.SPONSOR_SECRET;
      else process.env.SPONSOR_SECRET = val;
      const g = await GET(new Request("http://x/api/sponsor", { headers: { "x-forwarded-for": "10.0.0.1" } }));
      expect(g.status).toBe(200);
      expect((await g.json()).error).toBe(SPONSOR_NOT_CONFIGURED);
      const p = await POST(new Request("http://x/api/sponsor", { method: "POST", headers: { "x-forwarded-for": "10.0.0.2" }, body: JSON.stringify({ xdr: build() }) }));
      expect(p.status).toBe(503);
      expect((await p.json()).error).toBe("fee sponsor key not configured (SPONSOR_SECRET)");
    }
  });

  it("POST answers 400 with the reason before touching the network", async () => {
    process.env.SPONSOR_SECRET = Sdk.Keypair.random().secret();
    const p = await POST(new Request("http://x/api/sponsor", { method: "POST", headers: { "x-forwarded-for": "10.0.0.3" }, body: JSON.stringify({ xdr: build({ fn: "withdraw" }) }) }));
    expect(p.status).toBe(400);
    expect((await p.json()).error).toMatch(/not sponsorable/);
  });
});

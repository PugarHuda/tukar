import { describe, it, expect } from "vitest";
import * as Sdk from "@stellar/stellar-sdk";
import {
  POOL_USDC,
  parsePaths,
  bestSend,
  bestReceive,
  destMinFor,
  sendMaxFor,
  toStroops,
  impliedRate,
  noPathMessage,
  pathPayError,
  resultCodes,
  strictSendOp,
  quoteStrictSend,
} from "./pathpay";

const ANCHOR_USDC = new Sdk.Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const LUSD = { asset_type: "credit_alphanum4", asset_code: "LUSD", asset_issuer: "GBCMRD6NDL2RAJUOFQ25EHZVO3IRIGNESWE4QDRFB4AVFIP7IT5BRCJ6" };
const src = { source_asset_type: "credit_alphanum4", source_asset_code: "USDC", source_asset_issuer: ANCHOR_USDC.getIssuer(), source_amount: "10.0000000" };

// Shape of a live Horizon testnet /paths/strict-send answer (2026-10-13, anchor USDC -> XLM).
const LIVE = {
  _embedded: {
    records: [
      { ...src, destination_asset_type: "native", destination_amount: "60.8939227", path: [LUSD] },
      { ...src, destination_asset_type: "native", destination_amount: "20.0000000", path: [] },
    ],
  },
};

describe("path selection", () => {
  const qs = parsePaths(LIVE);
  it("parses hops and assets", () => {
    expect(qs).toHaveLength(2);
    expect(qs[0].sendAsset.equals(ANCHOR_USDC)).toBe(true);
    expect(qs[0].destAsset.isNative()).toBe(true);
    expect(qs[0].path[0].getCode()).toBe("LUSD");
  });
  it("picks the route that delivers most, ignores other destinations", () => {
    const b = bestSend(qs, Sdk.Asset.native())!;
    expect(b.destAmount).toBe("60.8939227");
    expect(bestSend(qs, POOL_USDC)).toBeNull();
    expect(impliedRate(b)).toBeCloseTo(6.08939227, 8);
  });
  it("on a tie prefers fewer hops", () => {
    const tie = parsePaths({ _embedded: { records: [LIVE._embedded.records[0], { ...LIVE._embedded.records[1], destination_amount: "60.8939227" }] } });
    expect(bestSend(tie, Sdk.Asset.native())!.path).toHaveLength(0);
  });
  it("strict-receive picks the cheapest source", () => {
    const r = parsePaths({ _embedded: { records: [{ ...src, source_amount: "3", destination_asset_type: "native", destination_amount: "10", path: [] }, { ...src, source_amount: "2.5", destination_asset_type: "native", destination_amount: "10", path: [LUSD] }] } });
    expect(bestReceive(r, ANCHOR_USDC)!.sendAmount).toBe("2.5");
  });
  it("empty answer = no route", () => {
    expect(bestSend(parsePaths({ _embedded: { records: [] } }), ANCHOR_USDC)).toBeNull();
    expect(noPathMessage(POOL_USDC, ANCHOR_USDC)).toBe("no SDEX liquidity between USDC:GC7SWG… and USDC:GBBD47… on testnet right now");
  });
});

describe("slippage math (stroop-exact)", () => {
  it("destMin floors quote x (1 - slippage)", () => {
    expect(destMinFor("60.8939227", 1)).toBe("60.2849834"); // 608939227 * 9900 / 10000 = 602849834.73 -> floor
    expect(destMinFor("10", 0.5)).toBe("9.9500000");
    expect(destMinFor("0.0000001", 1)).toBe("0.0000000");
  });
  it("sendMax rounds quote x (1 + slippage) up", () => {
    expect(sendMaxFor("2.5", 1)).toBe("2.5250000");
    expect(sendMaxFor("0.0000001", 1)).toBe("0.0000002");
  });
  it("rejects bad slippage and amounts", () => {
    expect(() => destMinFor("1", 0)).toThrow(/slippage/);
    expect(() => destMinFor("1", 51)).toThrow(/slippage/);
    expect(() => toStroops("1.12345678")).toThrow(/Stellar amount/);
    expect(() => toStroops("-1")).toThrow();
  });
  it("builds a self pathPaymentStrictSend carrying destMin and the hops", () => {
    const q = bestSend(parsePaths(LIVE), Sdk.Asset.native())!;
    const me = Sdk.Keypair.random().publicKey();
    const op = Sdk.Operation.fromXDRObject(strictSendOp(q, me, destMinFor(q.destAmount, 1))) as Sdk.Operation.PathPaymentStrictSend;
    expect(op.type).toBe("pathPaymentStrictSend");
    expect(op.destMin).toBe("60.2849834");
    expect(op.destination).toBe(me);
    expect(op.path.map((a) => a.getCode())).toEqual(["LUSD"]);
  });
});

describe("error mapping", () => {
  const x = Sdk.xdr;
  const failed = (inner: Sdk.xdr.OperationResultTr) =>
    new x.TransactionResult({ feeCharged: x.Int64.fromString("100"), result: x.TransactionResultResult.txFailed([x.OperationResult.opInner(inner)]), ext: x.TransactionResultExt.v0() });

  it("reads op codes out of a TransactionResult", () => {
    const r = failed(x.OperationResultTr.pathPaymentStrictSend(x.PathPaymentStrictSendResult.pathPaymentStrictSendUnderDestmin()));
    expect(resultCodes(r)).toEqual(["txFailed", "pathPaymentStrictSendUnderDestmin"]);
    expect(resultCodes(undefined)).toEqual([]);
  });
  it("maps each failure to a precise sentence", () => {
    const e = (c: string) => new Error(`tx FAILED [txFailed, ${c}]`);
    expect(pathPayError(e("pathPaymentStrictSendUnderDestmin"), { destMin: "60.28", dest: Sdk.Asset.native() })).toMatch(/less than your minimum of 60.28 XLM/);
    expect(pathPayError(e("pathPaymentStrictSendTooFewOffers"))).toMatch(/liquidity on the quoted route is gone/);
    expect(pathPayError(e("pathPaymentStrictSendNoTrust"), { dest: ANCHOR_USDC })).toMatch(/no trustline to USDC \(GBBD4…FLA5\)/);
    expect(pathPayError(e("pathPaymentStrictSendSrcNoTrust"), { source: POOL_USDC })).toMatch(/holds none/);
    expect(pathPayError(e("pathPaymentStrictSendUnderfunded"))).toMatch(/Not enough/);
    expect(pathPayError(new Error("boom"))).toBe("boom");
  });
});

// LIVE: a fresh friendbot key on testnet. It asks Horizon whether pool USDC routes anywhere, then
// takes the pool USDC from the repo's own faucet (faucetUsdc, the demo key) and ATTEMPTS that
// conversion for real; then runs a real XLM -> anchor USDC path payment and a real slippage failure.
// Run: PATHPAY_LIVE=1 npx vitest run lib/pathpay.test.ts
describe.runIf(process.env.PATHPAY_LIVE)("path payment, live on testnet", () => {
  it("quotes, converts, and maps a real slippage failure", async () => {
    const st = await import("./stellar");
    const kp = Sdk.Keypair.random();
    const address = kp.publicKey();
    expect((await fetch(`https://friendbot.stellar.org/?addr=${address}`)).ok).toBe(true);
    st.setWalletSigner({
      address,
      signTransaction: async (xdr: string) => {
        const tx = Sdk.TransactionBuilder.fromXDR(xdr, Sdk.Networks.TESTNET) as Sdk.Transaction;
        tx.sign(kp);
        return { signedTxXdr: tx.toXDR() };
      },
      signAuthEntry: async () => {
        throw new Error("unused");
      },
    });
    const anchorUsdc = await st.anchorAsset("USDC");

    // 1. Does the pool's USDC route to the anchor's USDC (or XLM) today?
    const poolRoutes = await quoteStrictSend(POOL_USDC, "1", [anchorUsdc, Sdk.Asset.native()]);
    console.log("pool USDC routes:", poolRoutes.length, poolRoutes.length ? "" : noPathMessage(POOL_USDC, anchorUsdc));

    // 2. Hold real pool USDC and try the conversion anyway: the network itself must refuse it.
    console.log("pool USDC trustline", await st.addTrustline(POOL_USDC));
    console.log("pool USDC faucet", await st.faucetUsdc(address, "1"));
    if (!poolRoutes.length) {
      const direct = { sendAsset: POOL_USDC, sendAmount: "1", destAsset: Sdk.Asset.native(), destAmount: "0.0000001", path: [] };
      const err = await st.convertViaPath(direct, "0.0000001").then(() => null, (e) => e);
      console.log("pool USDC -> XLM attempt:", String(err?.message));
      expect(pathPayError(err)).toMatch(/liquidity on the quoted route is gone/);
    }

    // 3. A route that exists: XLM -> anchor USDC.
    console.log("anchor USDC trustline", await st.addTrustline(anchorUsdc));
    const q = bestSend(await quoteStrictSend(Sdk.Asset.native(), "10", [anchorUsdc]), anchorUsdc);
    expect(q).not.toBeNull();
    const min = destMinFor(q!.destAmount, 1);
    console.log("quote 10 XLM ->", q!.destAmount, "anchor USDC, hops", q!.path.map((a) => a.getCode()), "destMin", min);
    const hash = await st.convertViaPath(q!, min);
    console.log("path payment tx", hash);
    const held = await st.assetHolding(address, anchorUsdc);
    expect(held.balance).toBeGreaterThanOrEqual(Number(min));

    // 4. Slippage: demand twice the quote; the network refuses with op_under_dest_min.
    const q2 = bestSend(await quoteStrictSend(Sdk.Asset.native(), "10", [anchorUsdc]), anchorUsdc)!;
    const greedy = (Number(q2.destAmount) * 2).toFixed(7);
    const err = await st.convertViaPath(q2, greedy).then(() => null, (e) => e);
    console.log("slippage attempt:", String(err?.message));
    expect(pathPayError(err, { destMin: greedy, dest: anchorUsdc })).toMatch(/Slippage/);
  }, 180_000);
});

import { describe, it, expect } from "vitest";
import * as Sdk from "@stellar/stellar-sdk";
import { parseSep24Tx, isTerminal, withdrawMemo, paymentFields, pollSep24, type Sep24Tx } from "./sep24";

// Shape of a live testanchor.stellar.org GET /sep24/transaction at pending_user_transfer_start.
const PENDING = {
  transaction: {
    id: "24c9817a",
    kind: "withdrawal",
    status: "pending_user_transfer_start",
    amount_in: "2",
    amount_out: "1.9",
    amount_fee: "0.1",
    withdraw_anchor_account: "GBN4NNCDGJO4XW4KQU3CBIESUJWFVBUZPOKUZHT7W7WRB7CWOA7BXVQF",
    withdraw_memo: "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=",
    withdraw_memo_type: "hash",
    more_info_url: "https://x/txn",
  },
};

describe("parseSep24Tx", () => {
  it("maps the withdraw fields the wallet pays to", () => {
    const t = parseSep24Tx(PENDING)!;
    expect(t.status).toBe("pending_user_transfer_start");
    expect(t.withdrawAnchorAccount).toBe(PENDING.transaction.withdraw_anchor_account);
    expect(t.amountIn).toBe("2");
    expect(t.stellarTxId).toBe("");
  });
  it("is null without a status", () => {
    expect(parseSep24Tx({ error: "not found" })).toBeNull();
  });
});

describe("withdrawMemo", () => {
  it("types text, id and base64 hash memos", () => {
    expect(withdrawMemo("abc", "text").type).toBe("text");
    expect(withdrawMemo("123", "id").value).toBe("123");
    const h = withdrawMemo(PENDING.transaction.withdraw_memo, "hash");
    expect(h.type).toBe("hash");
    expect(Buffer.from(h.value as Buffer).toString()).toBe("12345678901234567890123456789012");
    expect(withdrawMemo("", "text").type).toBe("none");
  });
  it("refuses a short hash and an unknown type", () => {
    expect(() => withdrawMemo(btoa("short"), "hash")).toThrow(/32 bytes/);
    expect(() => withdrawMemo("x", "return")).toThrow(/unsupported/);
  });
});

describe("paymentFields", () => {
  it("returns destination, amount and memo at pending_user_transfer_start only", () => {
    const f = paymentFields(parseSep24Tx(PENDING)!);
    expect(f.destination).toBe(PENDING.transaction.withdraw_anchor_account);
    expect(f.amount).toBe("2");
    const t = parseSep24Tx({ transaction: { ...PENDING.transaction, status: "incomplete" } })!;
    expect(() => paymentFields(t)).toThrow(/not waiting/);
    expect(() => paymentFields({ ...parseSep24Tx(PENDING)!, withdrawAnchorAccount: "" })).toThrow(/withdraw_anchor_account/);
    expect(() => paymentFields({ ...parseSep24Tx(PENDING)!, amountIn: "1.123456789" })).toThrow(/valid Stellar amount/);
  });
});

describe("pollSep24", () => {
  const seq = (...st: string[]) => {
    let i = 0;
    return async () => ({ ...parseSep24Tx(PENDING)!, status: st[Math.min(i++, st.length - 1)] });
  };
  it("stops at the wanted status and reports each change once", async () => {
    const seen: string[] = [];
    const t = await pollSep24(seq("incomplete", "incomplete", "pending_user_transfer_start"), (x) => x.status === "pending_user_transfer_start", { intervalMs: 1, onUpdate: (x) => seen.push(x.status) });
    expect(t.status).toBe("pending_user_transfer_start");
    expect(seen).toEqual(["incomplete", "pending_user_transfer_start"]);
  });
  it("returns early on a terminal status", async () => {
    expect((await pollSep24(seq("error"), () => false, { intervalMs: 1 })).status).toBe("error");
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("pending_anchor")).toBe(false);
  });
  it("times out and cancels", async () => {
    await expect(pollSep24(seq("incomplete"), () => false, { intervalMs: 5, timeoutMs: 20 })).rejects.toThrow(/timed out/);
    const ac = new AbortController();
    const p = pollSep24(seq("incomplete"), () => false, { intervalMs: 50, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toThrow(/cancelled/);
  });
});

// LIVE: a fresh friendbot key runs the whole SEP-24 withdraw against testanchor.stellar.org through
// the app's own lib/stellar functions (the key is installed as the "wallet" signer). The anchor's
// interactive window is filled through the same business-server calls its reference UI makes.
// Run: SEP24_LIVE=1 npx vitest run lib/sep24.test.ts
describe.runIf(process.env.SEP24_LIVE)("SEP-24 withdraw, live on testanchor", () => {
  it("deposits anchor USDC, withdraws it, pays the anchor and reaches completed", async () => {
    const st = await import("./stellar");
    const kp = Sdk.Keypair.random();
    const address = kp.publicKey();
    const r = await fetch(`https://friendbot.stellar.org/?addr=${address}`);
    expect(r.ok).toBe(true);
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
    const asset = await st.anchorAsset("USDC");
    expect(asset.getIssuer()).not.toBe(process.env.NEXT_PUBLIC_USDC_ISSUER || "GC7SWGHRQLMP4SW2AOBRSC2HFKVPNPHBH5A3PX3ZDVEJFMYKLWQ3SY3B");
    expect((await st.assetHolding(address, asset)).trusted).toBe(false);
    const trustHash = await st.addTrustline(asset);
    console.log("changeTrust", trustHash);

    // The interactive window, driven the way its reference UI does it (POST /start, then /submit).
    const fill = async (url: string, fields: Record<string, string>) => {
      const u = new URL(url);
      const biz = "https://anchor-reference-server-testanchor.stellar.org";
      const start = await (await fetch(`${biz}/start`, { method: "POST", headers: { Authorization: `Bearer ${u.searchParams.get("token")}` } })).json();
      expect(start.sessionId).toBeTruthy();
      const sub = await fetch(`${biz}/submit`, { method: "POST", headers: { Authorization: `Bearer ${start.sessionId}`, "Content-Type": "application/json" }, body: JSON.stringify(fields) });
      expect(sub.ok).toBe(true);
    };
    const who = { name: "Test", surname: "Receiver", email: "receiver@example.com" };

    // 1. Fund the key with the anchor's USDC through a real SEP-24 deposit (the anchor pays it).
    const dep = await st.anchorOnramp();
    await fill(dep.url, { amount: "5", ...who });
    const depDone = await pollSep24(() => st.anchorTxStatus(dep.sep24, dep.bearer, dep.id), (t) => t.status === "completed", { intervalMs: 4000, timeoutMs: 5 * 60_000, onUpdate: (t) => console.log("deposit", t.status) });
    expect(depDone.status).toBe("completed");
    const held = await st.assetHolding(address, asset);
    console.log("anchor USDC held", held.balance);
    expect(held.balance).toBeGreaterThan(2);

    // 2. The withdraw: open, fill, wait for pending_user_transfer_start, pay, then poll to terminal.
    const w = await st.anchorOfframp();
    await fill(w.url, { amount: "2", ...who, bank: "Test Bank", account: "12345678" });
    const log = (t: Sep24Tx) => console.log("withdraw", t.status, t.stellarTxId);
    const ready = await pollSep24(() => st.anchorTxStatus(w.sep24, w.bearer, w.id), (t) => t.status === "pending_user_transfer_start", { intervalMs: 4000, timeoutMs: 5 * 60_000, onUpdate: log });
    expect(ready.status).toBe("pending_user_transfer_start");
    console.log("pay", ready.amountIn, "to", ready.withdrawAnchorAccount, ready.withdrawMemoType, ready.withdrawMemo);
    const payHash = await st.payAnchorWithdraw(ready, asset);
    console.log("payment", payHash, st.txExplorer(payHash));
    const end = await pollSep24(() => st.anchorTxStatus(w.sep24, w.bearer, w.id), () => false, { intervalMs: 5000, timeoutMs: 10 * 60_000, onUpdate: log });
    console.log("final", end.status, end.stellarTxId, end.message);
    expect(end.status).toBe("completed");
    st.setWalletSigner(null);
  }, 25 * 60_000);
});

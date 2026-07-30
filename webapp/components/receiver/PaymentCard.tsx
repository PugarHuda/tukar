"use client";

// One incoming payment: reveal the local-fiat figure read on-chain from Reflector, withdraw
// on-chain (real transfer proof, ported from frontend/app.js), then cash out to fiat via
// Onramper or a SEP-24 anchor. All on-chain reads/writes and anchor calls are real.
import { useState } from "react";
import { Card, Button, Select, Input, Badge, Spinner, useToast } from "@/components/ui";
import {
  offrampQuote,
  offrampQuoteTwap,
  readReflectorRecords,
  withdrawSubmit,
  extDataHashFor,
  anchorOfframp,
  anchorTxStatus,
  onramperQuote,
  onramperOfframpUrl,
  activeAddress,
  txExplorer,
  explorer,
  verifyDisclosureOnChain,
  discloseThresholdViaPool,
  discloseRangeViaPool,
  discloseAggregateViaPool,
  registerAuditRequest,
  anchorReceipt,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
  type WriteResult,
} from "@/lib/stellar";
import {
  R,
  STROOPS,
  fmtUsdc,
  randomFieldElement,
  fullProve,
  CIRCUITS,
  AGG_N,
  short,
  verify,
  usdcToStroops,
  contextToField,
  proveExactDisclosure,
  proveThreshold,
  proveRange,
  buildAggregateInput,
  proveAggregate,
  makeReceipt,
  receiptCanonical,
  type Note,
  type AuditReceipt,
} from "@/lib/zk";
import { CORRIDORS, corridorByCode, fmtLocal, fmtAge, type ClaimedNote, type FxRate } from "./corridors";

type DiscMode = "exact" | "threshold" | "range" | "aggregate";

type Prover = { poseidon: any; F: any; tree: { root: (l: bigint[]) => bigint; pathElements: (l: bigint[], i: number) => bigint[] } };

type Props = {
  note: ClaimedNote;
  allNotes: ClaimedNote[];
  connected: boolean;
  prover: Prover | null;
  fxRates: Record<string, FxRate>;
  syncLeaves: () => Promise<bigint[]>;
  updateNote: (id: number, patch: Partial<ClaimedNote>) => void;
  setStatus: (text: string, busy?: boolean) => void;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Collapsed-by-default advanced action. Native <details> so the state costs no JS and the
// content stays mounted (React state inside survives a collapse). Keeps the default card clean:
// a tappable label row that expands the section.
function Expander({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-line pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">{label}</span>
        <span aria-hidden className="text-tf transition-transform duration-150 group-open:rotate-180">⌄</span>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export function PaymentCard({ note, allNotes, connected, prover, fxRates, syncLeaves, updateNote, setStatus }: Props) {
  const { toast } = useToast();
  const [onramperInfo, setOnramperInfo] = useState<string | null>(null);
  const [anchorInfo, setAnchorInfo] = useState<string | null>(null);

  const cor = corridorByCode(note.offCorridor || note.corridor);
  const usdcStr = fmtUsdc(BigInt(note.amount));
  const usdc = Number(usdcStr);
  const done = !!note.withdrawn;

  const onChainQuote = typeof note.localQuote === "number";
  const fx = fxRates[cor.currency];
  // Only ever display a figure backed by a live source: the on-chain median quote for
  // oracle corridors, or a live FX rate for the rest. Never a hardcoded number.
  const local: number | null = onChainQuote ? note.localQuote! : cor.oracle ? null : fx ? usdc * fx.rate : null;

  // ---- reveal: on-chain off-ramp quote (median of 5 Reflector records) + record depth ----
  async function reveal() {
    updateNote(note.id, { revealed: true });
    if (!cor.oracle) {
      setStatus(fx ? `Shown at the live ${cor.currency} rate.` : `Fetching a live ${cor.currency} rate.`);
      return;
    }
    setStatus(`Revealing your figure in ${cor.currency}.`, true);
    try {
      const q = await offrampQuoteTwap(cor.oracle, usdc, 5);
      if (q != null) updateNote(note.id, { localQuote: q });
      const depth = await readReflectorRecords(cor.oracle, 5);
      if (depth && depth.records.length) updateNote(note.id, { oracleDepth: depth.records });
      setStatus(
        q != null
          ? "Off-ramp figure read on-chain from the pool's Reflector quote."
          : "The FX oracle has no live price for this currency right now.",
      );
    } catch {
      setStatus("On-chain quote unavailable right now.");
    }
  }

  // Re-quote when the receiver changes the cash-out corridor.
  async function changeCorridor(code: string) {
    updateNote(note.id, { offCorridor: code, localQuote: undefined, oracleDepth: undefined, revealed: note.revealed });
    const c = corridorByCode(code);
    if (note.revealed && c.oracle) {
      try {
        const q = await offrampQuote(c.oracle, usdc);
        if (q != null) updateNote(note.id, { localQuote: q });
        const depth = await readReflectorRecords(c.oracle, 5);
        if (depth && depth.records.length) updateNote(note.id, { oracleDepth: depth.records });
      } catch {}
    }
  }

  // ---- withdraw on-chain: transfer proof + pool.withdraw (SAME path as app.js withdrawNote) ----
  async function withdraw() {
    if (done || note.withdrawing) return;
    if (!connected) {
      setStatus("Connect a wallet or the testnet key to withdraw on-chain.");
      return;
    }
    if (!prover) {
      setStatus("The zero-knowledge prover is still loading, try again in a moment.");
      return;
    }
    const { poseidon, F, tree } = prover;
    updateNote(note.id, { withdrawing: true });
    setStatus(`Building the shielded transfer proof for ${note.ref}.`, true);
    try {
      const amt = BigInt(note.amount);
      const W = amt; // release the full amount
      const dPriv = randomFieldElement(),
        dBlind = randomFieldElement();
      const dPub = F.toObject(poseidon([dPriv]));
      const dCommit = F.toObject(poseidon([0n, dPub, dBlind]));
      const o0Priv = randomFieldElement(),
        o0Blind = randomFieldElement();
      const o0Pub = F.toObject(poseidon([o0Priv]));
      const o0Amt = amt - W; // change (0 for a full withdraw)
      const o0Commit = F.toObject(poseidon([o0Amt, o0Pub, o0Blind]));
      const o1Priv = randomFieldElement(),
        o1Blind = randomFieldElement();
      const o1Pub = F.toObject(poseidon([o1Priv]));
      const o1Commit = F.toObject(poseidon([0n, o1Pub, o1Blind]));

      const recipient = activeAddress();
      const pubAmount = ((R - W) % R).toString();
      const extDataHash = extDataHashFor(recipient, pubAmount);

      // Min-receive settlement gate for oracle corridors: price at the median of 5 Reflector
      // records (the basis the on-chain gate enforces), floor to 99% (1% slippage). Whole-USDC
      // unit only, matching lib.rs. A null quote means no gate, so a transient read failure
      // never blocks a withdraw.
      let offrampSym: string | undefined;
      let minLocalOut: number | undefined;
      if (cor.oracle) {
        const usdcWhole = amt / STROOPS;
        if (usdcWhole > 0n) {
          const q = await offrampQuoteTwap(cor.oracle, Number(usdcWhole), 5);
          if (q != null && q > 0) {
            offrampSym = cor.oracle;
            minLocalOut = Math.floor(q * 0.99);
          }
        }
      }

      let res: WriteResult | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const leaves = await syncLeaves();
        const realIndex = leaves.findIndex((l) => l === BigInt(note.commitment));
        if (realIndex < 0) {
          updateNote(note.id, { withdrawing: false });
          setStatus(`${note.ref} is not registered in the on-chain tree yet, so it can't be withdrawn.`);
          return;
        }
        const n0 = F.toObject(poseidon([BigInt(note.commitment), BigInt(realIndex), BigInt(note.privKey)]));
        const n1 = F.toObject(poseidon([dCommit, 0n, dPriv]));
        const root = tree.root(leaves);
        const path = tree.pathElements(leaves, realIndex).map((x) => x.toString());
        const input = {
          root: root.toString(),
          publicAmount: pubAmount,
          extDataHash,
          inputNullifier: [n0.toString(), n1.toString()],
          outputCommitment: [o0Commit.toString(), o1Commit.toString()],
          inAmount: [note.amount, "0"],
          inPrivKey: [note.privKey, dPriv.toString()],
          inBlinding: [note.blinding, dBlind.toString()],
          inLeafIndex: [String(realIndex), "0"],
          inPathElements: [path, new Array(10).fill("0")],
          outAmount: [o0Amt.toString(), "0"],
          outPubkey: [o0Pub.toString(), o1Pub.toString()],
          outBlinding: [o0Blind.toString(), o1Blind.toString()],
        };
        const { proof, publicSignals } = await fullProve(input, CIRCUITS.transfer.wasm, CIRCUITS.transfer.zkey);
        setStatus(`Releasing tokens on-chain for ${note.ref}.`, true);
        res = await withdrawSubmit(proof, publicSignals, recipient, W, offrampSym, minLocalOut);
        if (res.ok) break;
        if (attempt < 3 && res.code === 1) {
          setStatus(`${note.ref}: the tree moved on, re-syncing (try ${attempt + 1}).`, true);
          continue;
        }
        break;
      }

      updateNote(note.id, { withdrawing: false });
      if (res?.ok) {
        updateNote(note.id, { withdrawn: res.hash || "ok" });
        setStatus(`${note.ref} withdrawn on-chain. Tokens released to your account. Cash out to fiat below.`);
      } else if (res?.code === 2) {
        updateNote(note.id, { withdrawn: "spent" });
        setStatus(`${note.ref} was already spent. Its nullifier is on-chain, so there is nothing left to withdraw.`);
      } else if (res?.code === 12) {
        setStatus(`${note.ref}: the live FX rate would deliver less than your minimum, so the release was blocked and the note is unspent.`);
      } else {
        setStatus("Withdraw failed. " + (res?.error || "unknown error"));
      }
    } catch (e: any) {
      updateNote(note.id, { withdrawing: false });
      setStatus("Withdraw failed. " + ((e && e.message) || e));
    }
  }

  // ---- cash out: Onramper (primary) ----
  async function cashOutOnramper() {
    const fiat = cor.currency || "USD";
    setStatus(`Fetching a live off-ramp quote for ${usdc} USDC to ${fiat}.`, true);
    setOnramperInfo(null);
    try {
      const q = await onramperQuote(usdc, fiat);
      const url = onramperOfframpUrl(usdc, fiat);
      const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=760");
      const quoteTxt = q
        ? `About ${q.payout.toLocaleString("en-US")} ${fiat} via ${q.ramp} (real provider quote, KYC by the provider).`
        : `No live ${fiat} quote right now, the widget prices it live.`;
      setOnramperInfo(quoteTxt);
      setStatus(
        w
          ? `Off-ramp opened for ${usdc} USDC. Finish KYC and payout in the provider window.`
          : `Allow pop-ups, or open the off-ramp link below. ${quoteTxt}`,
      );
      if (!w) setOnramperInfo(`${quoteTxt} Open: ${url}`);
    } catch (e: any) {
      setStatus("Onramper off-ramp failed. " + ((e && e.message) || e));
    }
  }

  // ---- cash out: SEP-24 anchor (secondary) ----
  async function cashOutAnchor() {
    setStatus("Anchor: authenticating (SEP-10) and opening a USDC withdraw (SEP-24).", true);
    setAnchorInfo(null);
    try {
      const { url, id, asset, sep24, bearer } = await anchorOfframp();
      const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=720");
      setStatus(
        w
          ? `Anchor off-ramp opened for ${asset}. Complete the cash-out in the anchor window (real SEP-24, tx ${String(id).slice(0, 8)}).`
          : `Allow pop-ups, or open: ${url}`,
      );
      pollAnchorStatus(sep24, bearer, id).catch(() => {});
    } catch (e: any) {
      setStatus("Anchor off-ramp failed. " + ((e && e.message) || e));
    }
  }

  // Track the real SEP-24 lifecycle (pending_user_transfer_start through completed).
  async function pollAnchorStatus(sep24: string, bearer: { Authorization: string }, id: string) {
    if (!sep24 || !bearer || !id) return;
    const pretty = (s: string) => String(s).replace(/_/g, " ");
    const terminal = /completed|refunded|error|expired|no_market/i;
    for (let i = 0; i < 6; i++) {
      await sleep(4000);
      const t = await anchorTxStatus(sep24, bearer, id);
      if (!t) continue;
      setAnchorInfo(
        `SEP-24 transfer ${String(id).slice(0, 8)}: ${pretty(t.status)}${t.amountOut ? `, you receive ${t.amountOut}` : ""}.` +
          (t.moreInfoUrl ? ` Details: ${t.moreInfoUrl}` : ""),
      );
      if (terminal.test(t.status)) return;
    }
  }

  // ---- depth: the N Reflector records behind the median, with freshness ----
  function depth() {
    const d = note.oracleDepth;
    if (!d || !d.length) return null;
    const rates = d.map((r) => r.rate).filter(isFinite);
    const sorted = [...rates].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const fresh = d.map((r) => r.ageSec).filter((x): x is number => x != null);
    const freshest = fresh.length ? Math.min(...fresh) : null;
    return (
      <div className="mt-3 rounded-tile border border-line bg-black/20 p-3 text-[11.5px] leading-relaxed text-tm">
        <span className="text-amber">Reflector depth</span>, {d.length} records read on-chain, freshest {fmtAge(freshest)} ago.
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {d.map((r, i) => {
            const dev = med > 0 ? Math.abs(r.rate - med) / med : 0;
            return (
              <span
                key={i}
                title={`${fmtLocal(r.rate)} · ${fmtAge(r.ageSec)} ago`}
                className={`inline-block h-3.5 w-2 rounded-sm ${dev > 0.03 ? "bg-orange" : "bg-green"}`}
              />
            );
          })}
          <span className="ml-1">
            median <b className="text-tp">{cor.symbol}{fmtLocal(med)}</b>, spread {fmtLocal(sorted[0])} to {fmtLocal(sorted[sorted.length - 1])}
          </span>
        </div>
      </div>
    );
  }

  // ---- prove to a regulator: selective disclosure over this claimed note ----
  // The holder has the note's full secrets, so it can produce real disclosure proofs. Each
  // proof reveals only the one chosen fact, is Groth16-checked in the browser, then re-checked
  // on the live Stellar verifier for its type. On success a portable receipt is assembled with
  // the SAME makeReceipt shape the Regulator console re-verifies, and it can be exported or
  // anchored on-chain. This is the honest holder path only (no tamper toggles).
  const [discMode, setDiscMode] = useState<DiscMode>("exact");
  const [auditCtx, setAuditCtx] = useState(`Regulator audit ${note.ref}`);
  const [threshVal, setThreshVal] = useState(String(Math.max(1, Math.ceil(usdc))));
  const [rangeLo, setRangeLo] = useState("0");
  const [rangeHi, setRangeHi] = useState(String(Math.max(1, Math.ceil(usdc)) + 100));
  const [aggCap, setAggCap] = useState("5000");
  const [proving, setProving] = useState(false);
  const [disc, setDisc] = useState<{ fact: React.ReactNode; onchain: boolean; verifierId: string } | null>(null);
  const [receipt, setReceipt] = useState<AuditReceipt | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorTx, setAnchorTx] = useState<string | null>(null);

  const resetDisc = () => {
    setDisc(null);
    setReceipt(null);
    setAnchorTx(null);
  };
  const ctxHash = () => contextToField(auditCtx.trim() || `audit-${note.commitment}`).toString();

  async function proveExactFlow() {
    const h = ctxHash();
    setStatus(`Generating an exact-disclosure proof for ${note.ref} in your browser.`, true);
    const { proof, publicSignals } = await proveExactDisclosure(note as Note, h);
    const ok = await verify(CIRCUITS.disclosure.vkey, publicSignals, proof);
    if (!ok) throw new Error("in-browser verification failed");
    const oc = await verifyDisclosureOnChain(proof, publicSignals).catch(() => ({ verified: false }));
    setDisc({
      fact: (
        <>
          Disclosed amount <b className="text-green-t">${fmtUsdc(publicSignals[1])} USDC</b>. Nothing else is revealed, no keys, no blinding, no other payments.
        </>
      ),
      onchain: oc.verified,
      verifierId: DISCLOSURE_VERIFIER,
    });
    setReceipt(makeReceipt("exact", { disclosedAmountUsdc: fmtUsdc(publicSignals[1]), commitment: note.commitment, auditContext: auditCtx, auditContextHash: h, disclosureVerifier: DISCLOSURE_VERIFIER }, proof, publicSignals));
    setStatus(oc.verified ? "Exact disclosure verified in your browser and on Stellar." : "Verified in your browser. On-chain check unavailable right now.");
  }

  async function proveThresholdFlow() {
    const h = ctxHash();
    const thr = usdcToStroops(threshVal || "0");
    if (BigInt(note.amount) > thr) {
      setStatus(`This payment is above $${fmtUsdc(thr)} USDC, so "amount is at or below the figure" cannot be proven. Raise the figure to disclose it is under.`);
      return;
    }
    setStatus(`Proving this payment is at or below $${fmtUsdc(thr)} USDC in your browser.`, true);
    const { proof, publicSignals } = await proveThreshold(note as Note, thr, h);
    const ok = await verify(CIRCUITS.threshold.vkey, publicSignals, proof);
    if (!ok) throw new Error("in-browser verification failed");
    const oc = await discloseThresholdViaPool(proof, publicSignals).catch(() => ({ verified: false }));
    setDisc({
      fact: (
        <>
          Proven this payment is <b className="text-green-t">at or below ${fmtUsdc(thr)} USDC</b>. The exact amount was never revealed.
        </>
      ),
      onchain: oc.verified,
      verifierId: THRESHOLD_VERIFIER,
    });
    setReceipt(makeReceipt("threshold", { thresholdUsdc: fmtUsdc(thr), commitment: note.commitment, auditContext: auditCtx, auditContextHash: h }, proof, publicSignals));
    setStatus(oc.verified ? "Threshold disclosure verified in your browser and on Stellar, bound to a known deposit." : "Verified in your browser. On-chain check unavailable right now.");
  }

  async function proveRangeFlow() {
    const h = ctxHash();
    const lo = usdcToStroops(rangeLo || "0");
    const hi = usdcToStroops(rangeHi || "0");
    const amt = BigInt(note.amount);
    if (lo > hi) {
      setStatus("The lower figure is above the upper figure. Set a valid band.");
      return;
    }
    if (amt < lo || amt > hi) {
      setStatus(`This payment is outside $${fmtUsdc(lo)} to $${fmtUsdc(hi)} USDC, so "in band" cannot be proven. Widen the band to disclose it is inside.`);
      return;
    }
    setStatus(`Proving this payment is between $${fmtUsdc(lo)} and $${fmtUsdc(hi)} USDC in your browser.`, true);
    const { proof, publicSignals } = await proveRange(note as Note, lo, hi, h);
    const ok = await verify(CIRCUITS.range.vkey, publicSignals, proof);
    if (!ok) throw new Error("in-browser verification failed");
    const oc = await discloseRangeViaPool(proof, publicSignals).catch(() => ({ verified: false }));
    setDisc({
      fact: (
        <>
          Proven this payment is <b className="text-green-t">between ${fmtUsdc(lo)} and ${fmtUsdc(hi)} USDC</b>. The exact amount was never revealed.
        </>
      ),
      onchain: oc.verified,
      verifierId: RANGE_VERIFIER,
    });
    setReceipt(makeReceipt("range", { bandUsdc: `$${fmtUsdc(lo)}-$${fmtUsdc(hi)}`, commitment: note.commitment, auditContext: auditCtx, auditContextHash: h }, proof, publicSignals));
    setStatus(oc.verified ? "Range disclosure verified in your browser and on Stellar, bound to a known deposit." : "Verified in your browser. On-chain check unavailable right now.");
  }

  async function proveAggregateFlow() {
    const sel = allNotes.slice(0, AGG_N);
    if (!sel.length) {
      setStatus("Claim at least one payment to prove a portfolio total.");
      return;
    }
    const cap = usdcToStroops(aggCap || "0");
    const ctxNonce = randomFieldElement().toString();
    setStatus(`Proving the sum of ${sel.length} claimed payment(s) is at or below $${fmtUsdc(cap)} USDC in your browser.`, true);
    const build = await buildAggregateInput({ notes: sel as unknown as Note[], capStroops: cap, ctxNonce });
    if (build.total > cap) {
      setStatus(`The total of your ${sel.length} payment(s) is above $${fmtUsdc(cap)} USDC, so "sum is at or below the cap" cannot be proven. Raise the cap to disclose the total is under it.`);
      return;
    }
    // On this testnet deploy the demo key is the auditor, so the holder can register the request
    // itself. In production an independent regulator issues (registers) the request first, then
    // the holder proves against it. The contract still enforces completeness either way.
    setStatus("Registering the audit request on-chain. On this testnet the demo key acts as the auditor.", true);
    const reg = await registerAuditRequest(build.issuedHash);
    if (!reg.ok) {
      setStatus("Could not register the audit request on-chain. " + (reg.error || ""));
      return;
    }
    setStatus(`Proving the sum of ${build.provenN} claimed payment(s) is at or below $${fmtUsdc(cap)} USDC in your browser.`, true);
    const { proof, publicSignals } = await proveAggregate(build);
    const ok = await verify(CIRCUITS.aggregate.vkey, publicSignals, proof);
    if (!ok) throw new Error("in-browser verification failed");
    const oc = await discloseAggregateViaPool(proof, publicSignals).catch(() => ({ verified: false }));
    setDisc({
      fact: (
        <>
          Proven the <b className="text-green-t">sum of {sel.length} claimed payment(s) is at or below ${fmtUsdc(cap)} USDC</b>. No individual amount was revealed.
        </>
      ),
      onchain: oc.verified,
      verifierId: AGGREGATE_VERIFIER,
    });
    setReceipt(makeReceipt("aggregate", { capUsdc: fmtUsdc(cap), commitments: sel.map((n) => n.commitment), auditContext: auditCtx, auditContextHash: build.issuedHash, ctxNonce }, proof, publicSignals));
    setStatus(oc.verified ? "Portfolio disclosure verified in your browser and on Stellar against the registered audit request." : "Verified in your browser. On-chain check unavailable right now.");
  }

  async function runProve() {
    if (proving) return;
    setProving(true);
    resetDisc();
    try {
      if (discMode === "exact") await proveExactFlow();
      else if (discMode === "threshold") await proveThresholdFlow();
      else if (discMode === "range") await proveRangeFlow();
      else await proveAggregateFlow();
    } catch (e: any) {
      setStatus("Proof failed. " + ((e && e.message) || e));
    } finally {
      setProving(false);
    }
  }

  function exportReceipt() {
    if (!receipt) return;
    const r = { ...receipt, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cmt = receipt.commitment || (receipt.commitments && receipt.commitments[0]) || receipt.publicSignals[0] || "receipt";
    a.download = `tukar-audit-receipt-${receipt.type}-${short(String(cmt)).replace(/[^\w]/g, "")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Receipt exported", "success");
    setStatus("Audit receipt exported. The regulator can re-verify the proof independently.");
  }

  async function anchorReceiptOnChain() {
    if (!receipt || anchoring) return;
    setAnchoring(true);
    setStatus("Anchoring the receipt hash on-chain.", true);
    try {
      const { txHash, sha256 } = await anchorReceipt(receiptCanonical(receipt));
      setReceipt({ ...receipt, anchor: { txHash, sha256, network: "Test SDF Network ; September 2015" } });
      setAnchorTx(txHash);
      toast("Receipt anchored", "success");
      setStatus("Receipt anchored on-chain. The export now carries a tamper-evident, timestamped proof.");
    } catch (e: any) {
      setStatus("Anchoring failed. " + ((e && e.message) || e));
    } finally {
      setAnchoring(false);
    }
  }

  // ---- prove-to-a-regulator section (collapsed by default, shown on active and withdrawn cards) ----
  const discloseSection = (
    <Expander label="Prove to a regulator">
      <p className="text-[12.5px] leading-relaxed text-tm">
        Generate a zero-knowledge selective-disclosure proof about this payment and export a receipt a regulator can verify. You reveal only the one fact you choose. Every proof is checked in your browser and on the live Stellar verifier.
      </p>

      <div className="mt-3">
        <Select
          id={`disc-mode-${note.id}`}
          label="What to prove"
          value={discMode}
          onChange={(e) => {
            setDiscMode(e.target.value as DiscMode);
            resetDisc();
          }}
        >
          <option value="exact">Exact amount, reveal this one figure</option>
          <option value="threshold">Amount is at or below a figure, amount stays hidden</option>
          <option value="range">Amount is inside a band, amount stays hidden</option>
          <option value="aggregate">Sum of my claimed payments is at or below a cap</option>
        </Select>
      </div>

      <div className="mt-3">
        <Input
          id={`audit-ctx-${note.id}`}
          label="Audit reference"
          value={auditCtx}
          onChange={(e) => setAuditCtx(e.target.value)}
          placeholder="who is this disclosure for"
        />
      </div>

      {discMode === "threshold" && (
        <div className="mt-3">
          <Input
            id={`thr-${note.id}`}
            label="Figure to stay at or below (USDC)"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={threshVal}
            onChange={(e) => setThreshVal(e.target.value)}
          />
        </div>
      )}

      {discMode === "range" && (
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="min-w-0 flex-1 basis-[120px]">
            <Input
              id={`lo-${note.id}`}
              label="Lower (USDC)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={rangeLo}
              onChange={(e) => setRangeLo(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1 basis-[120px]">
            <Input
              id={`hi-${note.id}`}
              label="Upper (USDC)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={rangeHi}
              onChange={(e) => setRangeHi(e.target.value)}
            />
          </div>
        </div>
      )}

      {discMode === "aggregate" && (
        <>
          <div className="mt-3">
            <Input
              id={`cap-${note.id}`}
              label="Cap for the sum of all claimed payments (USDC)"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={aggCap}
              onChange={(e) => setAggCap(e.target.value)}
            />
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-tm">
            Aggregates up to {AGG_N} of your claimed payments. On this testnet deploy the demo key is the auditor, so this app registers the audit request itself. In production an independent regulator issues that request first, then you prove against it. Either way the pool rejects any audit hash it never registered.
          </p>
        </>
      )}

      <div className="mt-3">
        <Button variant="primary" onClick={runProve} busy={proving} disabled={proving}>
          Generate proof
        </Button>
        {proving && (
          <div className="mt-2 flex">
            <Spinner label="Proving in your browser, this takes a few seconds" />
          </div>
        )}
      </div>

      {disc && (
        <div className="mt-3 rounded-tile border border-line bg-black/20 p-3.5">
          <p className="text-[12.5px] leading-relaxed text-ts">{disc.fact}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-tm">
            {disc.onchain ? (
              <>
                <span className="text-green-t">Verified on-chain</span> by the live Stellar verifier{" "}
                <a href={explorer(disc.verifierId)} target="_blank" rel="noreferrer" className="font-mono text-orange underline underline-offset-2">
                  {short(disc.verifierId)} ↗
                </a>
                .
              </>
            ) : (
              <>Verified in your browser. The on-chain check is unavailable right now, the exported receipt still re-verifies independently.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="subtle" onClick={exportReceipt}>
              Export receipt (JSON)
            </Button>
            {!anchorTx ? (
              <Button variant="ghost" onClick={anchorReceiptOnChain} busy={anchoring} disabled={anchoring}>
                Anchor on-chain
              </Button>
            ) : (
              <a
                href={txExplorer(anchorTx)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center font-mono text-xs text-green-t underline underline-offset-2"
              >
                Anchored · {short(anchorTx)} ↗
              </a>
            )}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-tm">
            The exported JSON is exactly what the regulator console re-verifies, in the browser and on-chain. Anchoring commits a tamper-evident SHA-256 of the receipt to the ledger.
          </p>
        </div>
      )}
    </Expander>
  );

  // ---- cash-out section (collapsed by default, shown once revealed or withdrawn) ----
  const cashOut = (
    <Expander label="Cash out to fiat">
      <div className="flex flex-col gap-2">
        <Button variant="primary" full onClick={cashOutOnramper}>
          Cash out to {cor.currency}, get a live quote
        </Button>
        <Button variant="ghost" full onClick={cashOutAnchor}>
          Withdraw via anchor (SEP-24)
        </Button>
      </div>
      {onramperInfo && <p className="mt-2.5 text-[12.5px] leading-relaxed text-ts break-words">{onramperInfo}</p>}
      {anchorInfo && <p className="mt-2 text-[12.5px] leading-relaxed text-amber break-words">{anchorInfo}</p>}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-tm">
        A licensed provider (Onramper routes to MoonPay or Transak, or a SEP-24 anchor) runs KYC and pays out the fiat. Tukar never touches the money.
      </p>
    </Expander>
  );

  // ---- withdrawn (done) card ----
  if (done) {
    return (
      <Card className="p-6">
        <div className="font-mono text-[10px] tracking-[0.14em] text-green-t uppercase">Withdrawn on-chain</div>
        <div className="mt-2 text-3xl font-black tracking-[-0.02em] text-green-t">
          ${usdcStr}
          <span className="ml-2 align-middle text-sm font-semibold text-tm">USDC released</span>
        </div>
        <div className="mt-1.5 text-[12px] text-tm">
          {note.ref}. The note was spent, tokens released to your account.
        </div>
        {note.withdrawn !== "spent" && note.withdrawn !== "ok" && (
          <a
            className="mt-3 inline-block font-mono text-xs text-orange underline underline-offset-2"
            href={txExplorer(note.withdrawn!)}
            target="_blank"
            rel="noreferrer"
          >
            View transaction ↗
          </a>
        )}
        {cashOut}
        {discloseSection}
      </Card>
    );
  }

  // ---- active (arrival) card ----
  return (
    <Card className="border-orange/[0.28] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl font-black tracking-[-0.02em] text-tp">
            ${usdcStr}
            <span className="ml-2 align-middle text-sm font-semibold text-tm">USDC</span>
          </div>
          <div className="mt-1.5 text-[12px] text-tm">{note.ref} · shielded arrival</div>
        </div>
        <Badge tone={note.revealed ? "green" : "orange"}>{note.revealed ? "Revealed" : "Shielded"}</Badge>
      </div>

      <div className="mt-4">
        <Select id={`cashout-${note.id}`} label="Cash out to" value={cor.code} onChange={(e) => changeCorridor(e.target.value)}>
          {CORRIDORS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.country} · {c.currency}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4">
        {!note.revealed ? (
          <Button variant="reveal" full onClick={reveal}>
            Reveal in {cor.currency} →
          </Button>
        ) : local != null ? (
          <div>
            <div className="text-2xl font-black tracking-[-0.02em] text-green-t">
              + {cor.symbol}
              {fmtLocal(local)} <span className="text-sm font-semibold text-tm">{cor.currency}</span>
            </div>
            <div className="mt-1 text-[11.5px] leading-relaxed text-tm">
              Your ${usdcStr} USDC, converted{" "}
              {onChainQuote
                ? "on-chain from the pool's Reflector quote, priced at the median of 5 records, the same basis the settlement gate enforces."
                : "at the live FX rate."}
            </div>
            {depth()}
          </div>
        ) : (
          <Spinner label={`Reading the ${cor.currency} figure on-chain.`} />
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {note.withdrawing ? (
          <Button variant="primary" full busy disabled>
            Withdrawing on-chain
          </Button>
        ) : (
          <Button variant="primary" full onClick={withdraw}>
            Withdraw on-chain
          </Button>
        )}
        {!note.revealed && (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-tm">
            Reveal first to see your local figure, then withdraw on-chain and cash out.
          </p>
        )}
      </div>

      {note.revealed && cashOut}
      {discloseSection}
    </Card>
  );
}

"use client";

// One incoming payment: reveal the local-fiat figure read on-chain from Reflector, withdraw
// on-chain (real transfer proof, ported from frontend/app.js), then cash out to fiat via a SEP-24
// anchor (full withdraw incl. the wallet payment), with Onramper as a mainnet price reference. All calls are real.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Input, Spinner, useToast } from "@/components/ui";
import {
  offrampQuote,
  offrampQuoteTwap,
  readReflectorRecords,
  withdrawSubmit,
  registerRootOnChain,
  extDataHashFor,
  anchorOfframp,
  anchorAuth,
  anchorEndpoints,
  anchorWithdrawLimits,
  anchorTxStatus,
  anchorAsset,
  assetHolding,
  addTrustline,
  payAnchorWithdraw,
  convertViaPath,
  type AnchorAuth,
  onramperQuote,
  onramperOfframpUrl,
  type OnramperQuote,
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
  decodeAuditRequest,
  makeReceipt,
  receiptCanonical,
  type Note,
  type AuditReceipt,
} from "@/lib/zk";
import { CORRIDORS, corridorByCode, fmtLocal, fmtAge, type ClaimedNote, type FxRate } from "./corridors";
import { buildRateAttestation, attestationCanonical, formatAttestation, summarizeAttestation } from "@/lib/rate-attestation";
import { getQuoteInfo, getIndicativePrice, requestFirmQuote, fiatForAnchor, type Sep38Price, type Sep38Quote } from "@/lib/sep38";
import { getKycStatus, putKycFields, type Kyc } from "@/lib/sep12";
import { pollSep24, isTerminal, type Sep24Tx } from "@/lib/sep24";
import { ANCHOR } from "@/lib/constants";
import { Asset } from "@stellar/stellar-sdk";
import { POOL_USDC, quoteStrictSend, quoteStrictReceive, bestSend, bestReceive, destMinFor, sendMaxFor, impliedRate, assetId, assetLabel, noPathMessage, pathPayError, type PathQuote } from "@/lib/pathpay";
import { SavingsNote } from "@/components/SavingsNote";
import { receiptLink } from "@/lib/receipt-link";
import { qrSvgString } from "@/components/sender/qr";
import { NotifyMe } from "@/components/NotifyMe";

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

// One payment is one box. Its label: an ink header strip (ref, state, route), the contents in
// stencilled tabular digits, FROM blacked out, a rubber stamp for the state. Attached slips
// (customs desk quote, receipt, forms) hang off the label behind a perforated edge, never as
// boxes inside the box.
const SHEET = "rounded-[3px] border border-ink bg-label shadow-card animate-tk-pop";
const BAR = "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[2px] bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label";
const CAP = "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2";
const SLIP = "mt-3 border-t-2 border-dashed border-ink/40 pt-3";
const NOTE = "text-[12.5px] leading-relaxed text-ink-2";
const AMOUNT = "font-stencil tabular-nums text-[clamp(30px,10vw,40px)] leading-none tracking-[0.01em] text-ink [overflow-wrap:anywhere]";
const LINK = "font-mono text-xs text-stamp-deep underline underline-offset-2";

// Collapsed-by-default advanced action. Native <details> so the state costs no JS and the
// content stays mounted (React state inside survives a collapse). Keeps the default label clean:
// a tappable stencilled row that expands the section.
function Expander({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group mt-4 border-t border-ink/25 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 [&::-webkit-details-marker]:hidden">
        <span className="font-stencil text-[15px] uppercase tracking-[0.04em] text-ink">{label}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 text-ink transition-transform duration-clock ease-clock group-open:rotate-180">
          <path d="M2.5 5 7 9.5 11.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export function PaymentCard({ note, allNotes, connected, prover, fxRates, syncLeaves, updateNote, setStatus }: Props) {
  const { toast } = useToast();
  // Onramper's live MAINNET quote, shown inline as a price reference (not a cash-out of this balance).
  const [onramperRef, setOnramperRef] = useState<{ fiat: string; q: OnramperQuote | { reason: string } | null } | null>(null);
  // The running SEP-24 withdraw: anchor tx record, the wallet-side payment, each status seen.
  // phase: interactive (user fills the anchor window) -> pay (anchor waits for our payment) ->
  // sending -> settling (paid, anchor pays out) -> done (terminal), or stopped (cancel/timeout).
  type Sep24Run = {
    sep24: string;
    bearer: { Authorization: string };
    id: string;
    url: string;
    assetCode: string;
    issuer: string;
    phase: "interactive" | "pay" | "sending" | "settling" | "done" | "stopped";
    tx: Sep24Tx | null;
    seen: Sep24Tx[];
    holding: { trusted: boolean; balance: number } | null;
    payHash: string | null;
    trustHash: string | null;
    error: string | null;
  };
  const [sep24Run, setSep24Run] = useState<Sep24Run | null>(null);
  const sep24Abort = useRef<AbortController | null>(null);
  // The anchor's own USDC (SEP-38 asset id "stellar:USDC:<issuer>"), read from its stellar.toml, so
  // the button can say which asset a withdraw spends before anything starts.
  const [anchorUsdcId, setAnchorUsdcId] = useState<string | null>(null);
  // Spot off-ramp quote (offramp_quote), shown beside the median for oracle corridors to make
  // the manipulation-resistance story visible. Component state, so it never persists to storage.
  const [spotQuote, setSpotQuote] = useState<number | null>(null);
  // Rate attestation: anchored-hash tx + in-flight flag. Component state only.
  const [attAnchorTx, setAttAnchorTx] = useState<string | null>(null);
  const [attAnchoring, setAttAnchoring] = useState(false);
  // In-flight flags so every button that talks to the chain or a provider shows a busy state.
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [cashBusy, setCashBusy] = useState<"onramper" | "anchor" | null>(null);
  // Anchor desk (SEP-38 + SEP-12 + SEP-24): the indicative price read before any auth, the
  // SEP-10 session reused across KYC status / firm quote / withdraw, the KYC read + slip, and
  // the FIRM quote the withdraw was bound to. Component state only, nothing persists.
  const [anchorPrice, setAnchorPrice] = useState<{ p: Sep38Price; buyAsset: string; sellAmount: number; cap: number | null } | { error: string } | null>(null);
  const [anchorSess, setAnchorSess] = useState<AnchorAuth | null>(null);
  const [kyc, setKyc] = useState<Kyc | null>(null);
  const [kycForm, setKycForm] = useState<Record<string, string>>({});
  const [firmQuote, setFirmQuote] = useState<Sep38Quote | null>(null);
  // Set when an oracle corridor's on-chain quote could not be read at withdraw time: the
  // settlement gate is fail-closed, so the withdraw is not sent and the button becomes a retry.
  const [gateError, setGateError] = useState<string | null>(null);

  // Switching receiver tabs unmounts every PaymentCard, so a running SEP-24 poll would keep
  // firing setState for ~24s on an unmounted card. Track liveness and bail out of the loop.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; sep24Abort.current?.abort(); }, []);

  const cor = corridorByCode(note.offCorridor || note.corridor);
  const usdcStr = fmtUsdc(BigInt(note.amount));
  const usdc = Number(usdcStr);
  const done = !!note.withdrawn;
  // ONE pricing basis for the whole card: the pool's quote and the withdraw gate price whole USDC
  // (lib.rs), floored. The quote helpers round, so 12.5 would otherwise show a 13-USDC figure next
  // to a 12-USDC gate. Everything on-chain below prices `gateUsdc` and says so when it differs.
  const gateUsdc = Number(BigInt(note.amount) / STROOPS);
  const basisNote = gateUsdc !== usdc ? ` Based on ${gateUsdc} USDC, the whole-USDC basis the on-chain gate prices.` : "";

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
    await readQuote(cor.oracle, cor.currency);
  }

  // Read the on-chain figure for an oracle corridor: median of 5 Reflector records (the SAME basis
  // the withdraw gate enforces), spot beside it, and the raw records behind the median.
  async function readQuote(oracleSym: string, currency: string) {
    if (gateUsdc < 1) {
      setStatus(`Under 1 USDC: the pool's on-chain quote prices whole USDC only, so there is no on-chain ${currency} figure for this payment.`);
      return;
    }
    setQuoteBusy(true);
    setStatus(`Reading the ${currency} figure on-chain from Reflector.`, true);
    try {
      const q = await offrampQuoteTwap(oracleSym, gateUsdc, 5);
      if (q != null) updateNote(note.id, { localQuote: q });
      setSpotQuote(await offrampQuote(oracleSym, gateUsdc));
      const depth = await readReflectorRecords(oracleSym, 5);
      if (depth && depth.records.length) updateNote(note.id, { oracleDepth: depth.records });
      setStatus(
        q != null
          ? "Off-ramp figure read on-chain from the pool's Reflector quote." + basisNote
          : "On-chain FX quote unavailable right now (no live Reflector price could be read). Retry in a moment.",
      );
    } catch {
      setStatus("On-chain FX quote unavailable right now (the chain read failed). Retry in a moment.");
    } finally {
      setQuoteBusy(false);
    }
  }

  // Re-quote when the receiver changes the cash-out corridor.
  async function changeCorridor(code: string) {
    updateNote(note.id, { offCorridor: code, localQuote: undefined, oracleDepth: undefined, revealed: note.revealed });
    setSpotQuote(null);
    const c = corridorByCode(code);
    if (!note.revealed) return;
    if (c.oracle) {
      await readQuote(c.oracle, c.currency);
    } else {
      // Non-oracle corridor: priced from a live FX API, not on-chain. Never spin on an on-chain read.
      const fx2 = fxRates[c.currency];
      setStatus(fx2 ? `Shown at the live ${c.currency} rate (FX API).` : `Live ${c.currency} rate unavailable right now. This corridor prices from a live FX API, not on-chain.`);
    }
  }

  // ---- finish the sender's tree registration from the receiver side ----
  // A deposit can land on-chain but fail its follow-up registerRootOnChain (e.g. the sender's
  // tab closed), leaving a valid bearer note whose commitment isn't yet an on-chain leaf and so
  // can't be withdrawn. This makes the sender's "the recipient's console can finish it" promise
  // real: same tree construction the sender's registerNote uses, same retry cases. Returns ok
  // once the commitment is (or already was) an on-chain leaf.
  async function finishRegistration(): Promise<{ ok: boolean; error?: string }> {
    if (!prover) return { ok: false, error: "prover not ready" };
    const { tree } = prover;
    const commitment = BigInt(note.commitment);
    let reg: WriteResult = { ok: false };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const leaves = await syncLeaves();
      // Already on-chain (a prior register landed but its response was lost, or another writer
      // inserted it), adopt the index rather than re-inserting, which would hit #9 and strand it.
      if (leaves.some((l) => l === commitment)) return { ok: true };
      const index = leaves.length;
      const oldRoot = tree.root(leaves);
      const path = tree.pathElements(leaves, index).map((x) => x.toString());
      const newRoot = tree.root([...leaves, commitment]);
      setStatus(`${note.ref} isn't in the on-chain tree yet. Finishing setup, registering it now (try ${attempt}).`, true);
      reg = await registerRootOnChain(oldRoot.toString(), note.commitment, newRoot.toString(), index, path);
      if (reg.ok) return { ok: true };
      // UnknownRoot (#1): another deposit advanced the tree between our sync and submit, re-sync.
      if (attempt < 3 && reg.code === 1) {
        setStatus(`Tree advanced by another deposit, re-syncing (try ${attempt + 1}).`, true);
        continue;
      }
      // UnknownCommitment (#3): the deposit hasn't propagated to the read node yet, wait, retry.
      if (attempt < 3 && reg.code === 3) {
        setStatus(`Confirming ${note.ref}'s deposit on-chain (try ${attempt + 1}).`, true);
        await sleep(4500);
        continue;
      }
      // LeafAlreadyInserted (#9): another writer inserted it first, re-sync to adopt its index.
      if (attempt < 3 && reg.code === 9) {
        setStatus(`${note.ref} was just registered elsewhere, re-syncing (try ${attempt + 1}).`, true);
        continue;
      }
      break;
    }
    return { ok: false, error: reg.error };
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
    setGateError(null);
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
      // unit only, matching lib.rs. FAIL-CLOSED: if the quote cannot be read the withdraw is not
      // sent, since an ungated release would contradict the enforced-gate guarantee. Amounts under
      // 1 USDC cannot be gated by the contract at all and are released ungated, and say so.
      let offrampSym: string | undefined;
      let minLocalOut: number | undefined;
      if (cor.oracle && gateUsdc >= 1) {
        const q = await offrampQuoteTwap(cor.oracle, gateUsdc, 5).catch(() => null);
        if (q == null || !(q > 0)) {
          updateNote(note.id, { withdrawing: false });
          setGateError("On-chain FX quote unavailable, so the withdraw was not sent: the settlement gate needs a live Reflector price to enforce your minimum. Retry in a moment.");
          setStatus(`${note.ref}: withdraw held. The on-chain FX quote could not be read, and the gate is fail-closed.`);
          return;
        }
        offrampSym = cor.oracle;
        minLocalOut = Math.floor(q * 0.99);
      }

      let res: WriteResult | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        let leaves = await syncLeaves();
        let realIndex = leaves.findIndex((l) => l === BigInt(note.commitment));
        if (realIndex < 0) {
          // Not an on-chain leaf yet, finish the sender's tree registration, then re-sync.
          const reg = await finishRegistration();
          if (!reg.ok) {
            updateNote(note.id, { withdrawing: false });
            setStatus(`${note.ref} isn't registered on-chain yet and registration couldn't finish: ${reg.error || "unknown error"}. The deposit is valid, so try withdrawing again in a moment.`);
            return;
          }
          leaves = await syncLeaves();
          realIndex = leaves.findIndex((l) => l === BigInt(note.commitment));
          if (realIndex < 0) {
            // Registered on-chain but the read node hasn't caught up (read-after-write lag).
            if (attempt < 3) {
              setStatus(`${note.ref} registered on-chain, waiting for the node to catch up (try ${attempt + 1}).`, true);
              await sleep(4500);
              continue;
            }
            updateNote(note.id, { withdrawing: false });
            setStatus(`${note.ref} was registered on-chain but isn't visible to the node yet. Try withdrawing again in a moment.`);
            return;
          }
          setStatus(`${note.ref} registered into the shielded tree. Building the withdrawal proof.`, true);
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

  // ---- mainnet price reference: Onramper ----
  // Onramper's providers buy MAINNET USDC on Stellar; this card holds TESTNET USDC. So this reads
  // their live quote as a real-world price reference and shows it inline. It is not a cash-out of
  // this balance, and the widget is only linked, labelled for what it is.
  async function priceReference() {
    if (cashBusy) return;
    const fiat = cor.currency || "USD";
    setCashBusy("onramper");
    setOnramperRef(null);
    try {
      const q = await onramperQuote(usdc, fiat);
      setOnramperRef({ fiat, q });
      setStatus(q && "payout" in q ? `Mainnet price reference read from Onramper (${q.ramp}).` : `No mainnet price reference for ${fiat} right now.`);
    } finally {
      setCashBusy(null);
    }
  }

  // ---- cash out: SEP-24 anchor (secondary), priced by a SEP-38 quote, gated by SEP-12 ----
  const errMsg = (e: any) => String((e && e.message) || e);
  const fiatOf = (asset: string) => asset.replace(/^iso4217:/, "");

  // Indicative price from the anchor's quote server as soon as the cash-out slip can show (no auth
  // needed for GET /price). Sized to what the anchor will actually take: its SEP-24 withdraw cap
  // (testanchor: 10 USDC), because the firm quote's sell_amount must equal the withdraw amount.
  useEffect(() => {
    if (!(note.revealed || done)) return;
    let alive = true;
    setAnchorPrice(null);
    (async () => {
      try {
        const ep = await anchorEndpoints();
        if (alive) setAnchorUsdcId(ep.assets.USDC || null);
        if (!ep.quote || !ep.assets.USDC) throw new Error("the anchor publishes no SEP-38 quote server for USDC");
        const [assets, lim] = await Promise.all([getQuoteInfo(ep.quote), anchorWithdrawLimits("USDC")]);
        const buyAsset = fiatForAnchor(cor.currency, assets);
        const sellAmount = lim.max != null && usdc > lim.max ? lim.max : usdc;
        const p = await getIndicativePrice(ep.quote, { sellAsset: ep.assets.USDC, buyAsset, sellAmount });
        if (alive) setAnchorPrice({ p, buyAsset, sellAmount, cap: lim.max });
      } catch (e) {
        if (alive) setAnchorPrice({ error: errMsg(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [note.revealed, done, cor.currency, usdc]);

  async function cashOutAnchor() {
    if (cashBusy) return;
    setCashBusy("anchor");
    setStatus("Anchor: authenticating (SEP-10) and reading your KYC status (SEP-12).", true);
    try {
      const auth = anchorSess || (await anchorAuth());
      setAnchorSess(auth);
      const k = auth.endpoints.kyc ? await getKycStatus(auth.endpoints.kyc, auth.token) : null;
      setKyc(k);
      if (k && k.status !== "accepted" && k.required.length) {
        setStatus(`Anchor KYC ${k.status.replace("_", " ")}: the anchor needs ${k.required.length} field${k.required.length === 1 ? "" : "s"} before a withdraw. Fill the slip below and send it.`);
        return;
      }
      await anchorWithdraw(auth);
    } catch (e: any) {
      setStatus("Anchor off-ramp failed. " + errMsg(e));
    } finally {
      setCashBusy(null);
    }
  }

  // The minimal SEP-12 slip: exactly the fields the anchor's GET /customer marked required.
  async function submitKyc() {
    if (cashBusy || !anchorSess?.endpoints.kyc || !kyc) return;
    setCashBusy("anchor");
    setStatus("Sending the KYC slip to the anchor (SEP-12).", true);
    try {
      await putKycFields(anchorSess.endpoints.kyc, anchorSess.token, kycForm);
      const k = await getKycStatus(anchorSess.endpoints.kyc, anchorSess.token);
      setKyc(k);
      if (k.status === "accepted" || !k.required.length) await anchorWithdraw(anchorSess);
      else setStatus(`Anchor KYC ${k.status.replace("_", " ")}. ${k.message || "The anchor has not accepted this account yet."}`);
    } catch (e: any) {
      setStatus("Anchor KYC failed. " + errMsg(e));
    } finally {
      setCashBusy(null);
    }
  }

  // Firm quote first (the anchor commits to a rate until expires_at), then the SEP-24 withdraw
  // with that quote_id bound in. If the anchor will not commit (its CAD leg answered 502 live),
  // say so and still open the withdraw unbound: the anchor then prices it in its own window.
  async function anchorWithdraw(auth: AnchorAuth) {
    const ap = anchorPrice && "p" in anchorPrice ? anchorPrice : null;
    let quote: Sep38Quote | null = null;
    let quoteNote = "";
    if (ap && auth.endpoints.quote && auth.endpoints.assets.USDC) {
      setStatus("Anchor: requesting a firm quote (SEP-38).", true);
      try {
        quote = await requestFirmQuote(auth.endpoints.quote, auth.token, { sellAsset: auth.endpoints.assets.USDC, buyAsset: ap.buyAsset, sellAmount: ap.sellAmount });
        setFirmQuote(quote);
      } catch (e) {
        quoteNote = ` No firm quote: ${errMsg(e)}. The withdraw is open without one, so the anchor prices it in its window.`;
      }
    }
    setStatus(`Anchor: opening a USDC withdraw (SEP-24)${quote ? " bound to the firm quote" : ""}.`, true);
    const { url, id, asset, sep24, bearer } = await anchorOfframp({ auth, quote: quote ? { id: quote.id, sellAmount: quote.sellAmount, buyAsset: quote.buyAsset } : undefined });
    const issuer = (await anchorAsset(asset)).getIssuer() || "";
    const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=720");
    setStatus(
      (w
        ? `Anchor window opened for a ${asset} withdraw${quote ? ` at the committed rate (quote ${quote.id.slice(0, 8)})` : ""}. Fill it in there; this card then asks you to send the ${asset} (SEP-24 tx ${String(id).slice(0, 8)}).`
        : `Allow pop-ups, or open the anchor window from the link below.`) + quoteNote,
    );
    void runSep24({ sep24, bearer, id, url, assetCode: asset, issuer });
  }

  // ---- the SEP-24 withdraw lifecycle (the part the anchor window does not do) ----
  // 1. poll GET /transaction until the anchor reaches pending_user_transfer_start (the user is in
  //    its window meanwhile), 2. the user sends amount_in of the ANCHOR's asset to
  //    withdraw_anchor_account with the typed memo (sendToAnchor), 3. poll on to a terminal state.
  const patchRun = (id: string, p: Partial<Sep24Run> | ((r: Sep24Run) => Partial<Sep24Run>)) => {
    if (aliveRef.current) setSep24Run((r) => (r && r.id === id ? { ...r, ...(typeof p === "function" ? p(r) : p) } : r));
  };
  const SEP24_WAIT_MS = 30 * 60_000; // the anchor's interactive session and payout both fit inside this

  function trackSep24(r: Pick<Sep24Run, "sep24" | "bearer" | "id">, until: (t: Sep24Tx) => boolean): Promise<Sep24Tx> {
    sep24Abort.current?.abort();
    const ac = new AbortController();
    sep24Abort.current = ac;
    return pollSep24(() => anchorTxStatus(r.sep24, r.bearer, r.id), until, {
      signal: ac.signal,
      timeoutMs: SEP24_WAIT_MS,
      onUpdate: (t) => patchRun(r.id, (cur) => ({ tx: t, seen: [...cur.seen, t] })),
    });
  }

  async function readHolding(r: Pick<Sep24Run, "assetCode">) {
    return assetHolding(activeAddress(), await anchorAsset(r.assetCode));
  }

  async function runSep24(base: Pick<Sep24Run, "sep24" | "bearer" | "id" | "url" | "assetCode" | "issuer">) {
    setSep24Run({ ...base, phase: "interactive", tx: null, seen: [], holding: null, payHash: null, trustHash: null, error: null });
    try {
      const t = await trackSep24(base, (x) => x.status === "pending_user_transfer_start");
      if (isTerminal(t.status)) return patchRun(base.id, { phase: "done" });
      const holding = await readHolding(base).catch(() => null);
      patchRun(base.id, { phase: "pay", holding });
      setStatus(`Anchor is waiting for ${t.amountIn} ${base.assetCode}. Review the payment on the card and send it.`);
    } catch (e) {
      patchRun(base.id, { phase: "stopped", error: errMsg(e) });
    }
  }

  async function addAnchorTrustline() {
    const r = sep24Run;
    if (!r || cashBusy) return;
    setCashBusy("anchor");
    setStatus(`Adding a trustline to ${r.assetCode} (${short(r.issuer)}).`, true);
    try {
      const hash = await addTrustline(await anchorAsset(r.assetCode));
      patchRun(r.id, { trustHash: hash, holding: await readHolding(r).catch(() => null), error: null });
      setStatus(`Trustline to ${r.assetCode} added. Your balance of it is still 0 until you receive some.`);
    } catch (e) {
      patchRun(r.id, { error: errMsg(e) });
      setStatus("Trustline failed. " + errMsg(e));
    } finally {
      setCashBusy(null);
    }
  }

  async function sendToAnchor() {
    const r = sep24Run;
    if (!r || !r.tx || r.phase !== "pay" || cashBusy) return;
    setCashBusy("anchor");
    try {
      const asset = await anchorAsset(r.assetCode);
      const holding = await assetHolding(activeAddress(), asset);
      const need = Number(r.tx.amountIn);
      if (!holding.trusted || holding.balance < need) {
        patchRun(r.id, { holding });
        setStatus(
          holding.trusted
            ? `Not enough ${r.assetCode}: the anchor needs ${need}, this account holds ${holding.balance}.`
            : `This account has no trustline to ${r.assetCode} (${short(r.issuer)}). Add it first.`,
        );
        return;
      }
      patchRun(r.id, { phase: "sending", error: null });
      setStatus(`Sending ${r.tx.amountIn} ${r.assetCode} to the anchor (sign in your wallet if asked).`, true);
      const hash = await payAnchorWithdraw(r.tx, asset);
      patchRun(r.id, { phase: "settling", payHash: hash });
      setStatus(`Payment sent to the anchor. Waiting for it to pay out.`, true);
      const end = await trackSep24(r, () => false);
      patchRun(r.id, { phase: "done", tx: end });
      setStatus(`SEP-24 withdraw ${end.status.replace(/_/g, " ")}.`);
    } catch (e) {
      // Before the payment landed: back to "pay" so it can be retried. After: tracking stopped.
      patchRun(r.id, (cur) => ({ phase: cur.payHash ? "stopped" : "pay", error: errMsg(e) }));
      setStatus("Anchor withdraw: " + errMsg(e));
    } finally {
      setCashBusy(null);
    }
  }

  function cancelSep24() {
    sep24Abort.current?.abort();
  }

  // ---- Convert at the receiving edge: a native Stellar path payment ----
  // The pool pays out USDC:USDC_ISSUER; the anchor only takes its own USDC. Horizon's path finder
  // quotes the live SDEX books + AMM pools, then a pathPaymentStrictSend to yourself converts with
  // destMin enforced on-chain. When Horizon finds no route we say so; nothing here makes a market.
  type Route = { dest: Asset; best: PathQuote | null; trusted: boolean | null };
  type Conv = {
    source: "pool" | "xlm";
    amount: string;
    slippage: string;
    routes: Route[] | null;
    at: number;
    /** strict-receive: what the anchor's exact amount_in costs from this source */
    need: { amount: string; best: PathQuote | null } | null;
    hash: string | null;
    received: string | null;
    failHash: string | null;
    error: string | null;
  };
  const [conv, setConv] = useState<Conv>({ source: "pool", amount: usdcStr, slippage: "1", routes: null, at: 0, need: null, hash: null, received: null, failHash: null, error: null });
  const [convBusy, setConvBusy] = useState<string | null>(null);
  const convSource = conv.source === "pool" ? POOL_USDC : Asset.native();
  const minOf = (q: PathQuote): string | null => {
    try {
      return destMinFor(q.destAmount, Number(conv.slippage));
    } catch {
      return null;
    }
  };

  async function quoteRoutes() {
    if (convBusy) return;
    setConvBusy("quote");
    setConv((c) => ({ ...c, routes: null, need: null, error: null, failHash: null }));
    try {
      const anchor = await anchorAsset("USDC");
      const dests = [anchor, Asset.native()].filter((a) => !a.equals(convSource));
      const me = activeAddress();
      const [quotes, trusted] = await Promise.all([
        quoteStrictSend(convSource, conv.amount.trim(), dests),
        Promise.all(dests.map((d) => (d.isNative() ? true : assetHolding(me, d).then((h) => h.trusted, () => null)))),
      ]);
      const routes = dests.map((dest, i) => ({ dest, best: bestSend(quotes, dest), trusted: trusted[i] }));
      const r = sep24Run;
      let need: Conv["need"] = null;
      if (r?.tx && r.phase === "pay" && !anchor.equals(convSource)) {
        need = { amount: r.tx.amountIn, best: bestReceive(await quoteStrictReceive([convSource], anchor, r.tx.amountIn), convSource) };
      }
      if (aliveRef.current) setConv((c) => ({ ...c, routes, need, at: Date.now() }));
    } catch (e) {
      if (aliveRef.current) setConv((c) => ({ ...c, error: errMsg(e) }));
    } finally {
      setConvBusy(null);
    }
  }

  async function trustRoute(rt: Route) {
    if (convBusy) return;
    setConvBusy(assetId(rt.dest));
    setStatus(`Adding a trustline to ${assetLabel(rt.dest)}.`, true);
    try {
      const hash = await addTrustline(rt.dest);
      setConv((c) => ({ ...c, routes: c.routes && c.routes.map((x) => (x.dest.equals(rt.dest) ? { ...x, trusted: true } : x)) }));
      setStatus(`Trustline to ${assetLabel(rt.dest)} added (tx ${hash.slice(0, 8)}). Now convert.`);
    } catch (e) {
      setConv((c) => ({ ...c, error: "Trustline failed. " + errMsg(e) }));
      setStatus("Trustline failed. " + errMsg(e));
    } finally {
      setConvBusy(null);
    }
  }

  async function convert(rt: Route) {
    const q = rt.best;
    const min = q && minOf(q);
    if (!q || convBusy) return;
    if (!min) return setConv((c) => ({ ...c, error: "Slippage must be above 0% and at most 50%." }));
    setConvBusy(assetId(rt.dest));
    setStatus(`Converting ${q.sendAmount} ${assetLabel(q.sendAsset)} to at least ${min} ${assetLabel(q.destAsset)} (pathPaymentStrictSend; sign in your wallet if asked).`, true);
    try {
      const hash = await convertViaPath(q, min);
      const held = q.destAsset.isNative() ? null : await assetHolding(activeAddress(), q.destAsset).catch(() => null);
      setConv((c) => ({ ...c, hash, failHash: null, error: null, routes: null, received: held ? `${held.balance} ${assetLabel(q.destAsset)} now held` : null }));
      if (sep24Run) patchRun(sep24Run.id, { holding: await readHolding(sep24Run).catch(() => null) });
      setStatus(`Converted on the SDEX: at least ${min} ${assetLabel(q.destAsset)} received.`);
    } catch (e: any) {
      const msg = pathPayError(e, { destMin: min, dest: q.destAsset, source: q.sendAsset });
      setConv((c) => ({ ...c, error: msg, failHash: e?.hash || null }));
      setStatus("Convert failed. " + msg);
    } finally {
      setConvBusy(null);
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
    const devOf = (r: number) => (med > 0 ? Math.abs(r - med) / med : 0);
    const outliers = rates.filter((r) => devOf(r) > 0.03).length;
    return (
      <div className={`mt-3 border-t border-ink/25 pt-2.5 ${NOTE}`}>
        <b className="text-ink">Reflector depth</b>, {d.length} records read on-chain, freshest {fmtAge(freshest)} ago.
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span
            role="img"
            aria-label={`${d.length} Reflector records: ${d.length - outliers} within 3% of the median, ${outliers} further out`}
            className="inline-flex items-center gap-1"
          >
            {d.map((r, i) => (
              <span
                key={i}
                title={`${fmtLocal(r.rate)} · ${fmtAge(r.ageSec)} ago${devOf(r.rate) > 0.03 ? " · more than 3% from the median" : ""}`}
                className={`inline-block h-3.5 w-2 ${devOf(r.rate) > 0.03 ? "bg-tape" : "bg-stamp"}`}
              />
            ))}
          </span>
          <span className="ml-1">
            median <b className="text-ink">{cor.symbol}{fmtLocal(med)}</b>, spread {fmtLocal(sorted[0])} to {fmtLocal(sorted[sorted.length - 1])}
            {outliers > 0 && `, ${outliers} of ${d.length} more than 3% from the median`}
          </span>
        </div>
      </div>
    );
  }

  // ---- rate attestation: package the median settlement basis already in hand ----
  // Built ONLY from data reveal()/withdraw() already fetched, the pool's median off-ramp quote
  // (note.localQuote = offramp_quote_twap) and the 5 raw Reflector records behind it
  // (note.oracleDepth = readReflectorRecords). No new RPC. Memoized so builtAt is stable across
  // renders (the anchored hash stays reproducible). Enriched with the withdraw tx + enforced floor
  // once withdrawn (floor = median − 1% slippage, the same formula the withdraw gate applied).
  const withdrawTx =
    done && note.withdrawn && note.withdrawn !== "spent" && note.withdrawn !== "ok" ? note.withdrawn : null;
  const attestation = useMemo(() => {
    if (!cor.oracle || typeof note.localQuote !== "number" || !note.oracleDepth?.length) return null;
    return buildRateAttestation({
      corridor: { code: cor.code, currency: cor.currency, symbol: cor.symbol, oracleSymbol: cor.oracle },
      amountUsdc: gateUsdc, // the whole-USDC basis the median actually priced (see gateUsdc)
      settledMedian: note.localQuote,
      basis: note.oracleDepth,
      minLocalOut: done ? Math.floor(note.localQuote * 0.99) : null,
      withdrawTx,
      // The anchor's committed rate rides along once a SEP-24 withdraw was bound to it.
      anchorQuote: firmQuote
        ? {
            id: firmQuote.id,
            anchor: ANCHOR.home,
            sellAmount: firmQuote.sellAmount,
            buyAsset: firmQuote.buyAsset,
            buyAmount: firmQuote.buyAmount,
            rate: firmQuote.price,
            totalPrice: firmQuote.totalPrice,
            feeTotal: firmQuote.feeTotal,
            expiresAt: firmQuote.expiresAt,
          }
        : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cor.oracle, cor.code, note.localQuote, note.oracleDepth, done, withdrawTx, gateUsdc, firmQuote]);

  async function copyAttestation() {
    if (!attestation) return;
    try {
      await navigator.clipboard.writeText(formatAttestation(attestation));
      toast("Attestation copied", "success");
    } catch {
      setStatus("Copy failed. Use Download instead.");
    }
  }

  function downloadAttestation() {
    if (!attestation) return;
    // Download the CANONICAL bytes (what gets hashed), so re-hashing the file reproduces the anchor.
    const blob = new Blob([attestationCanonical(attestation)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tukar-rate-attestation-${cor.code}-${usdc}usdc.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Attestation downloaded", "success");
  }

  async function anchorAttestation() {
    if (!attestation || attAnchoring) return;
    setAttAnchoring(true);
    setStatus("Anchoring the rate attestation hash on-chain.", true);
    try {
      const { txHash } = await anchorReceipt(attestationCanonical(attestation));
      setAttAnchorTx(txHash);
      toast("Attestation anchored", "success");
      setStatus("Rate attestation hash anchored on-chain. " + summarizeAttestation(attestation));
    } catch (e: any) {
      setStatus("Anchoring failed. " + ((e && e.message) || e));
    } finally {
      setAttAnchoring(false);
    }
  }

  const rateAttest = attestation && (
    <Expander label="Rate attestation">
      <p className={NOTE}>
        A portable proof your figure was priced at the median the on-chain withdraw gate enforces. Copy or download it, and anchor its SHA-256 on the ledger.
      </p>
      <div className={`${SLIP} font-mono text-[12px] leading-relaxed text-ink`}>
        {summarizeAttestation(attestation)}
        {attAnchorTx && (
          <>
            {" "}
            Hash anchored in{" "}
            <a href={txExplorer(attAnchorTx)} target="_blank" rel="noreferrer" className={LINK}>
              {short(attAnchorTx)} ↗
            </a>
            .
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="subtle" onClick={copyAttestation}>
          Copy
        </Button>
        <Button variant="subtle" onClick={downloadAttestation}>
          Download (JSON)
        </Button>
        {!attAnchorTx ? (
          <Button variant="ghost" onClick={anchorAttestation} busy={attAnchoring} disabled={attAnchoring}>
            Anchor hash on-chain
          </Button>
        ) : (
          <a href={txExplorer(attAnchorTx)} target="_blank" rel="noreferrer" className={`inline-flex items-center ${LINK}`}>
            Anchored · {short(attAnchorTx)} ↗
          </a>
        )}
      </div>
      <p className={`mt-2.5 ${NOTE}`}>
        This attests the fill matched the enforced median gate over the same 5 Reflector records. It is not a claim about the fiat a provider finally pays out.
      </p>
    </Expander>
  );

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
  const [auditReq, setAuditReq] = useState("");
  const [proving, setProving] = useState(false);
  const [disc, setDisc] = useState<{ fact: React.ReactNode; onchain: boolean; verifierId: string } | null>(null);
  const [receipt, setReceipt] = useState<AuditReceipt | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorTx, setAnchorTx] = useState<string | null>(null);

  // Shareable verification link (/verify#r=<receipt>) + its QR, rebuilt whenever the receipt
  // changes (anchoring adds the anchor field, so the link picks it up).
  const [link, setLink] = useState<string | null>(null);
  const [linkSvg, setLinkSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!receipt) {
      setLink(null);
      setLinkSvg(null);
      return;
    }
    let live = true;
    (async () => {
      try {
        const l = await receiptLink(receipt);
        if (!live) return;
        setLink(l);
        setLinkSvg(await qrSvgString(l, "#161311", "#f6f1e7", "Verification link QR code").catch(() => null));
      } catch {
        if (live) setLink(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [receipt]);

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast("Verification link copied", "success");
    } catch {
      setStatus("Copy failed. Select the link text in the receipt and copy it by hand.");
    }
  }

  const receiptFact = !receipt
    ? ""
    : receipt.type === "exact"
      ? `Amount disclosed: $${receipt.disclosedAmountUsdc} USDC`
      : receipt.type === "threshold"
        ? `Amount at or below $${receipt.thresholdUsdc} USDC (exact amount hidden)`
        : receipt.type === "range"
          ? `Amount within ${receipt.bandUsdc} USDC (exact amount hidden)`
          : `Sum of ${receipt.commitments?.length ?? 0} payments at or below $${receipt.capUsdc} USDC (individual amounts hidden)`;

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
          Disclosed amount <b className="text-stamp-deep">${fmtUsdc(publicSignals[1])} USDC</b>. Nothing else is revealed, no keys, no blinding, no other payments.
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
          Proven this payment is <b className="text-stamp-deep">at or below ${fmtUsdc(thr)} USDC</b>. The exact amount was never revealed.
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
          Proven this payment is <b className="text-stamp-deep">between ${fmtUsdc(lo)} and ${fmtUsdc(hi)} USDC</b>. The exact amount was never revealed.
        </>
      ),
      onchain: oc.verified,
      verifierId: RANGE_VERIFIER,
    });
    setReceipt(makeReceipt("range", { bandUsdc: `$${fmtUsdc(lo)}-$${fmtUsdc(hi)}`, commitment: note.commitment, auditContext: auditCtx, auditContextHash: h }, proof, publicSignals));
    setStatus(oc.verified ? "Range disclosure verified in your browser and on Stellar, bound to a known deposit." : "Verified in your browser. On-chain check unavailable right now.");
  }

  async function proveAggregateFlow() {
    // REQUEST MODE, prove against a regulator-issued audit request. The request carries the exact
    // ordered commitments[5] + active[5] + ctxNonce (+ cap) that the regulator already registered
    // on-chain, so the proven issuedHash equals the registered one and the pool accepts it. The
    // holder cannot trim the set: every ACTIVE required commitment must be matched to a claimed note.
    const reqStr = auditReq.trim();
    if (reqStr) {
      let req;
      try {
        req = decodeAuditRequest(reqStr);
      } catch (e: any) {
        setStatus("That audit request could not be read. " + ((e && e.message) || e));
        return;
      }
      // Rebuild the required openings in the request's slot order (Poseidon is order-sensitive).
      const required: string[] = [];
      for (let i = 0; i < AGG_N; i++) if (req.active[i] === "1") required.push(req.commitments[i]);
      if (!required.length) {
        setStatus("This audit request lists no active payments to prove.");
        return;
      }
      const orderedNotes: Note[] = [];
      let missing = 0;
      for (const c of required) {
        const n = allNotes.find((x) => x.commitment === c);
        if (n) orderedNotes.push(n as unknown as Note);
        else missing++;
      }
      if (missing) {
        setStatus(`This request covers ${missing} payment(s) you do not hold, so you cannot prove it. Only the holder of every listed payment can answer this request.`);
        return;
      }
      const cap = BigInt(req.cap);
      // Same ctxNonce + ordered commitments + active flags -> the same issuedHash the regulator registered.
      const build = await buildAggregateInput({ notes: orderedNotes, capStroops: cap, ctxNonce: req.ctxNonce });
      if (build.total > cap) {
        setStatus(`The total of the ${required.length} required payment(s) is above $${fmtUsdc(cap)} USDC, so it is not within the regulator's cap and cannot be proven under it.`);
        return;
      }
      setStatus(`Proving the sum of ${required.length} payment(s) is at or below $${fmtUsdc(cap)} USDC against the regulator's request.`, true);
      const { proof, publicSignals } = await proveAggregate(build);
      const ok = await verify(CIRCUITS.aggregate.vkey, publicSignals, proof);
      if (!ok) throw new Error("in-browser verification failed");
      // No self-registration: the regulator already registered this exact audit hash on-chain.
      const oc = await discloseAggregateViaPool(proof, publicSignals).catch(() => ({ verified: false }));
      setDisc({
        fact: (
          <>
            Proven the <b className="text-stamp-deep">sum of {required.length} payment(s) in the regulator&apos;s request is at or below ${fmtUsdc(cap)} USDC</b>. No individual amount was revealed, and the set could not be trimmed.
          </>
        ),
        onchain: oc.verified,
        verifierId: AGGREGATE_VERIFIER,
      });
      setReceipt(makeReceipt("aggregate", { capUsdc: fmtUsdc(cap), commitments: orderedNotes.map((n) => n.commitment), auditContext: auditCtx, auditContextHash: build.issuedHash, ctxNonce: req.ctxNonce }, proof, publicSignals));
      setStatus(oc.verified ? "Portfolio disclosure verified in your browser and on Stellar against the regulator's registered request." : "Verified in your browser. On-chain check unavailable right now.");
      return;
    }

    // SELF-SERVE MODE (demo-only convenience), no request loaded, so the holder self-computes the
    // ctxNonce over its own claimed notes and self-registers (the demo key is the auditor here).
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
          Proven the <b className="text-stamp-deep">sum of {sel.length} claimed payment(s) is at or below ${fmtUsdc(cap)} USDC</b>. No individual amount was revealed.
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
      <p className={NOTE}>
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
              id={`audit-req-${note.id}`}
              label="Load an audit request (tukaudit1:), optional"
              value={auditReq}
              onChange={(e) => setAuditReq(e.target.value)}
              placeholder="tukaudit1:… paste a regulator-issued request"
            />
          </div>
          {auditReq.trim() ? (
            <p className={`mt-2 ${NOTE}`}>
              Request mode, the production path. You prove the sum of the exact payments the regulator listed is within their cap, against the audit hash they already registered on-chain. The cap comes from the request, you cannot cherry-pick a subset, and the proof will not run unless you hold every payment listed.
            </p>
          ) : (
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
              <p className={`mt-2 ${NOTE}`}>
                Self-serve mode, a demo-only convenience. It aggregates up to {AGG_N} of your claimed payments; on this testnet deploy the demo key is the auditor, so this app registers the audit request itself. The production path is request mode above: an independent regulator issues the request first, then you prove against it. Either way the pool rejects any audit hash it never registered.
              </p>
            </>
          )}
        </>
      )}

      <div className="mt-3">
        <Button
          variant="primary"
          onClick={runProve}
          busy={proving}
          disabled={proving}
          title={proving ? "Proving in your browser, please wait" : undefined}
        >
          Generate proof
        </Button>
        {proving && (
          <div className="mt-2 flex">
            <Spinner label="Proving in your browser, this takes a few seconds" />
          </div>
        )}
      </div>

      {disc && (
        <div className={SLIP}>
          <div className="flex flex-wrap items-start gap-3">
            <span className={`tk-stamp animate-tk-ring shrink-0 ${disc.onchain ? "" : "tk-stamp-ink"}`}>{disc.onchain ? "Verified" : "Browser only"}</span>
            <p className={`min-w-0 flex-1 text-[13px] leading-relaxed text-ink`}>{disc.fact}</p>
          </div>
          <p className={`mt-2 ${NOTE}`}>
            {disc.onchain ? (
              <>
                <b className="text-stamp-deep">Verified on-chain</b> by the live Stellar verifier{" "}
                <a href={explorer(disc.verifierId)} target="_blank" rel="noreferrer" className={LINK}>
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
              <a href={txExplorer(anchorTx)} target="_blank" rel="noreferrer" className={`inline-flex items-center ${LINK}`}>
                Anchored · {short(anchorTx)} ↗
              </a>
            )}
          </div>
          <p className={`mt-2.5 ${NOTE}`}>
            The exported JSON is exactly what the regulator console re-verifies, in the browser and on-chain. Anchoring commits a tamper-evident SHA-256 of the receipt to the ledger.
          </p>
        </div>
      )}

      {/* Proof-of-payment receipt: a strip of receipt paper stapled across the label (perforated top and
          bottom, edge to edge), with the verification link + QR. It is the panel that prints (see .tk-print). */}
      {receipt && (
        <div className="tk-print -mx-5 mt-4 border-y-2 border-dashed border-ink/50 bg-white px-5 py-4 text-[12.5px] leading-relaxed text-ink">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink pb-2">
            <span className="font-stencil text-[18px] uppercase tracking-[0.02em]">Payment receipt</span>
            <span className="font-mono text-[11px] text-ink-3">Tukar · Stellar testnet</span>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[12px] [&_dd]:min-w-0 [&_dd]:break-all [&_dd]:text-ink [&_dt]:pt-px [&_dt]:text-[11px] [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-[0.06em] [&_dt]:text-ink-3">
            <dt>Printed</dt>
            <dd>{new Date().toLocaleString()}</dd>
            <dt>Reference</dt>
            <dd>{note.ref}</dd>
            <dt>Corridor</dt>
            <dd>{cor.country} · {cor.currency}</dd>
            <dt>Disclosure</dt>
            <dd>{receiptFact}</dd>
            {receipt.auditContext && (
              <>
                <dt>Audit ref</dt>
                <dd>{receipt.auditContext}</dd>
              </>
            )}
            <dt>{receipt.type === "aggregate" ? "Commitments" : "Commitment"}</dt>
            <dd className="text-[11px]">{receipt.type === "aggregate" ? (receipt.commitments as string[] | undefined)?.join(", ") : receipt.commitment}</dd>
            {withdrawTx && (
              <>
                <dt>Withdraw tx</dt>
                <dd className="text-[11px]">{withdrawTx}</dd>
              </>
            )}
            {receipt.anchor && (
              <>
                <dt>Anchor tx</dt>
                <dd className="text-[11px]">{receipt.anchor.txHash}</dd>
              </>
            )}
            <dt>Verifier</dt>
            <dd className="text-[11px]">{receipt.verifier}</dd>
            {attestation && (
              <>
                <dt>Rate</dt>
                <dd>
                  {summarizeAttestation(attestation)}
                  {attAnchorTx && ` Hash anchored in ${attAnchorTx}.`}
                </dd>
              </>
            )}
            <dt>Verify at</dt>
            <dd className="text-[11px]">{link || "building the verification link"}</dd>
          </dl>
          {linkSvg && (
            <div className="mx-auto mt-4 h-52 w-52 max-w-full overflow-hidden border border-ink/30 bg-white p-2" dangerouslySetInnerHTML={{ __html: linkSvg }} />
          )}
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <Button variant="subtle" onClick={copyLink} disabled={!link}>
              Copy verification link
            </Button>
            <Button variant="subtle" onClick={() => window.print()}>
              Print receipt
            </Button>
          </div>
          <p className={`mt-2.5 ${NOTE} print:hidden`}>
            The link carries the whole receipt after the # in the URL, so it is never sent to a server. Anyone who opens it re-runs the on-chain checks. It reveals only what this disclosure reveals.
          </p>
        </div>
      )}
    </Expander>
  );

  // ---- anchor desk slip: indicative SEP-38 price, SEP-12 KYC stamp + slip, the committed quote ----
  const KYC_WORD: Record<Kyc["status"], string> = { not_started: "not started", needs_info: "needs info", pending: "pending", accepted: "accepted", rejected: "rejected" };
  const fmtExpiry = (iso: string) => iso.replace("T", " ").replace(/(:\d\d)(\.\d+)?Z$/, "$1 UTC");
  const kycNeedsSlip = !!kyc && kyc.status !== "accepted" && kyc.required.length > 0;
  const anchorDesk = (
    <div className={SLIP}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={CAP}>Anchor desk</span>
        <span className="font-mono text-[11px] text-ink-3">SEP-38 quote, {ANCHOR.home}</span>
      </div>
      {anchorPrice == null ? (
        <div className="mt-1.5">
          <Spinner label="Reading the anchor's indicative price." />
        </div>
      ) : "error" in anchorPrice ? (
        <p className="mt-1.5 break-words font-mono text-[12px] leading-relaxed text-tape-deep">Anchor price unavailable: {anchorPrice.error}</p>
      ) : (
        <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink">
          Indicative: {anchorPrice.sellAmount} USDC to <b>{anchorPrice.p.buyAmount} {fiatOf(anchorPrice.buyAsset)}</b>, {anchorPrice.p.price} USDC per {fiatOf(anchorPrice.buyAsset)} before a {anchorPrice.p.feeTotal} USDC fee.
          {anchorPrice.sellAmount !== usdc && ` The reference anchor caps a withdraw at ${anchorPrice.cap} USDC, so ${anchorPrice.sellAmount} of your ${usdcStr} USDC is quoted.`}
          {fiatOf(anchorPrice.buyAsset) !== cor.currency && ` The anchor quotes USD and CAD only, not ${cor.currency}.`}
        </p>
      )}
      {kyc && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`tk-stamp stamp-xs ${kyc.status === "accepted" ? "" : kyc.status === "rejected" ? "tk-stamp-red" : "tk-stamp-ink"}`}>KYC {KYC_WORD[kyc.status]}</span>
          <span className="font-mono text-[11px] text-ink-3">
            SEP-12, {kyc.id ? `customer ${short(kyc.id)}` : "no record at the anchor"}. The reference anchor&apos;s KYC is a test stub: it accepts the slip at once, with no review.
          </span>
        </div>
      )}
      {kycNeedsSlip && (
        <div className="mt-3 grid gap-2">
          {kyc!.required.map((f) => (
            <Input
              key={f.name}
              id={`kyc-${note.id}-${f.name}`}
              label={f.name.replace(/_/g, " ")}
              placeholder={f.description}
              type={f.name.includes("email") ? "email" : "text"}
              autoComplete="off"
              value={kycForm[f.name] || ""}
              onChange={(e) => setKycForm({ ...kycForm, [f.name]: e.target.value })}
            />
          ))}
          <Button variant="ghost" onClick={submitKyc} busy={cashBusy === "anchor"} disabled={!!cashBusy || kyc!.required.some((f) => !(kycForm[f.name] || "").trim())}>
            Send KYC slip to anchor (SEP-12)
          </Button>
        </div>
      )}
      {firmQuote && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="tk-stamp stamp-xs animate-tk-ring">Rate committed</span>
          <span className="font-mono text-[12px] leading-relaxed text-ink">
            Firm quote {firmQuote.id.slice(0, 8)}: {firmQuote.buyAmount} {fiatOf(firmQuote.buyAsset)} for {firmQuote.sellAmount} USDC at {firmQuote.price} USDC per {fiatOf(firmQuote.buyAsset)}, fee {firmQuote.feeTotal} USDC, expires {fmtExpiry(firmQuote.expiresAt)}. Bound into the SEP-24 withdraw as quote_id.
          </span>
        </div>
      )}
    </div>
  );

  // ---- the running SEP-24 withdraw: which asset it spends, the payment it needs, each status ----
  const anchorIssuer = anchorUsdcId ? anchorUsdcId.split(":")[2] || "" : "";
  const run = sep24Run;
  const pretty = (st: string) => st.replace(/_/g, " ");
  const sep24Slip = run && (
    <div className={SLIP} aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className={CAP}>SEP-24 withdraw {run.id.slice(0, 8)}</span>
        <span className="font-mono text-[11px] text-ink-3">
          spends {run.assetCode} issued by {short(run.issuer)}
        </span>
      </div>
      {run.phase === "interactive" && (
        <div className="mt-1.5">
          <Spinner label={`Waiting for you to finish the anchor window (status: ${run.tx ? pretty(run.tx.status) : "opening"}).`} />
          <p className={`mt-1.5 ${NOTE}`}>
            Window closed or blocked?{" "}
            <a className={LINK} href={run.url} target="_blank" rel="noopener noreferrer">
              Open the anchor window
            </a>
            .
          </p>
        </div>
      )}
      {(run.phase === "pay" || run.phase === "sending") && run.tx && (
        <div className="mt-1.5">
          <p className="font-mono text-[12px] leading-relaxed text-ink">
            The anchor is waiting for <b>{run.tx.amountIn} {run.assetCode}</b> (issuer {short(run.issuer)}) to {short(run.tx.withdrawAnchorAccount)}, memo {run.tx.withdrawMemoType || "text"} {run.tx.withdrawMemo || "(none)"}.
            {run.tx.amountOut && ` You receive ${run.tx.amountOut} after a ${run.tx.amountFee || "0"} fee.`}
          </p>
          <p className="mt-1 font-mono text-[12px] leading-relaxed text-ink-2">
            Paid from {short(activeAddress())}.{" "}
            {run.holding == null
              ? "Balance not read yet."
              : run.holding.trusted
                ? `It holds ${run.holding.balance} ${run.assetCode}${run.holding.balance < Number(run.tx.amountIn) ? `, short of the ${run.tx.amountIn} needed` : ""}.`
                : `It has no trustline to ${run.assetCode} (${short(run.issuer)}), so it holds none.`}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {run.holding && !run.holding.trusted && (
              <Button variant="ghost" full onClick={addAnchorTrustline} busy={cashBusy === "anchor" && run.phase === "pay"} disabled={!!cashBusy}>
                Add {run.assetCode} trustline (changeTrust)
              </Button>
            )}
            <Button variant="primary" full onClick={sendToAnchor} busy={run.phase === "sending"} disabled={!!cashBusy || !run.holding?.trusted}>
              Send {run.tx.amountIn} {run.assetCode} to the anchor
            </Button>
          </div>
        </div>
      )}
      {run.phase === "settling" && (
        <div className="mt-1.5">
          <Spinner label="Paid. Waiting for the anchor to pay out." />
        </div>
      )}
      {run.seen.length > 0 && (
        <ol className="mt-2 grid gap-0.5 font-mono text-[12px] leading-relaxed text-ink">
          {run.seen.map((t, i) => (
            <li key={i}>
              {pretty(t.status)}
              {t.stellarTxId && (
                <>
                  {", "}
                  <a className={LINK} href={txExplorer(t.stellarTxId)} target="_blank" rel="noopener noreferrer">
                    tx {short(t.stellarTxId)}
                  </a>
                </>
              )}
              {t.message && <span className="text-ink-3"> ({t.message})</span>}
            </li>
          ))}
        </ol>
      )}
      {(run.payHash || run.trustHash) && (
        <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink">
          {run.trustHash && (
            <a className={`${LINK} mr-3`} href={txExplorer(run.trustHash)} target="_blank" rel="noopener noreferrer">
              trustline tx {short(run.trustHash)}
            </a>
          )}
          {run.payHash && (
            <a className={LINK} href={txExplorer(run.payHash)} target="_blank" rel="noopener noreferrer">
              payment tx {short(run.payHash)}
            </a>
          )}
        </p>
      )}
      {run.phase === "done" && run.tx && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={`tk-stamp stamp-xs ${run.tx.status === "completed" ? "" : "tk-stamp-red"}`}>{pretty(run.tx.status)}</span>
          {run.tx.moreInfoUrl && (
            <a className={LINK} href={run.tx.moreInfoUrl} target="_blank" rel="noopener noreferrer">
              anchor details
            </a>
          )}
        </p>
      )}
      {run.error && <p className="mt-1.5 break-words font-mono text-[12px] leading-relaxed text-tape-deep">{run.error}</p>}
      {run.phase === "stopped" && (
        <p className={`mt-1.5 ${NOTE}`}>
          Tracking stopped. The transaction stays open at the anchor{run.payHash ? " and your payment is on-chain" : ""}; check it on the anchor&apos;s own details page.
        </p>
      )}
      {(run.phase === "interactive" || run.phase === "settling") && (
        <div className="mt-2">
          <Button variant="ghost" onClick={cancelSep24}>
            Stop tracking
          </Button>
        </div>
      )}
    </div>
  );

  // ---- mainnet price reference (Onramper), inline ----
  const ref = onramperRef;
  const priceRef = ref && (
    <div className="mt-2.5 font-mono text-[12px] leading-relaxed text-ink">
      {ref.q == null ? (
        <p>Onramper did not answer, so there is no mainnet price reference right now.</p>
      ) : "reason" in ref.q ? (
        <p>No mainnet quote for {usdcStr} USDC to {ref.fiat}: {ref.q.reason}.</p>
      ) : (
        <p>
          Mainnet price reference: {ref.q.amount} USDC to <b>{ref.q.payout.toLocaleString("en-US")} {ref.fiat}</b> via {ref.q.ramp}
          {ref.q.paymentMethod && ` (${ref.q.paymentMethod})`}, rate {ref.q.rate} {ref.fiat} per USDC, provider fee {ref.q.fee} {ref.fiat}.
        </p>
      )}
      <p className={`mt-1 ${NOTE}`}>
        This is Onramper&apos;s live price for selling MAINNET USDC. Your {usdcStr} USDC is testnet USDC, which no provider buys, so this is a reference, not a cash-out.{" "}
        <a className={LINK} href={onramperOfframpUrl(usdc, ref.fiat)} target="_blank" rel="noopener noreferrer">
          Onramper widget (sells mainnet USDC)
        </a>
      </p>
    </div>
  );

  // ---- Step 1, only when the anchor's USDC is not the pool's: convert on the SDEX ----
  const needsConvert = !!anchorIssuer && anchorIssuer !== POOL_USDC.getIssuer();
  const convertSlip = needsConvert && (
    <div className={SLIP} aria-live="polite">
      <div className={CAP}>Step 1 · Convert pool USDC to the anchor&apos;s USDC (SDEX path payment)</div>
      <p className={`mt-1 ${NOTE}`}>
        The pool paid you USDC issued by {short(POOL_USDC.getIssuer()!)}; {ANCHOR.home} only takes USDC issued by {short(anchorIssuer)}. Horizon&apos;s path finder quotes the live order
        books and AMM pools, and a path payment to yourself converts with your minimum enforced on-chain.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select
          label="From"
          value={conv.source}
          onChange={(e) => {
            const source = e.target.value as Conv["source"];
            setConv((c) => ({ ...c, source, amount: source === "pool" ? usdcStr : "10", routes: null, need: null, error: null }));
          }}
        >
          <option value="pool">Pool USDC (your remittance)</option>
          <option value="xlm">XLM (gas balance, not the remittance)</option>
        </Select>
        <Input label="Amount" inputMode="decimal" value={conv.amount} onChange={(e) => setConv((c) => ({ ...c, amount: e.target.value, routes: null }))} />
        <Input label="Slippage %" inputMode="decimal" value={conv.slippage} onChange={(e) => setConv((c) => ({ ...c, slippage: e.target.value }))} />
      </div>
      <div className="mt-2">
        <Button variant="ghost" full onClick={quoteRoutes} busy={convBusy === "quote"} disabled={!!convBusy}>
          {conv.routes ? "Re-quote routes" : "Quote routes (Horizon path finder)"}
        </Button>
      </div>
      {conv.routes && (
        <ul className="mt-2 grid gap-2">
          {conv.routes.map((rt) => {
            const q = rt.best;
            const min = q && minOf(q);
            return (
              <li key={assetId(rt.dest)} className="border-t border-ink/20 pt-2 font-mono text-[12px] leading-relaxed text-ink">
                {q ? (
                  <>
                    <p>
                      {q.sendAmount} {assetLabel(q.sendAsset)} → <b>{q.destAmount} {assetLabel(q.destAsset)}</b>
                    </p>
                    <p className="text-ink-2">
                      Route: {[q.sendAsset, ...q.path, q.destAsset].map(assetLabel).join(" → ")}
                      {q.path.length ? "" : " (direct)"}. Rate {impliedRate(q).toPrecision(7)} per unit. Min received {min ?? "(fix the slippage)"} at {conv.slippage}% slippage.
                    </p>
                    <div className="mt-1.5">
                      {rt.trusted === false ? (
                        <Button variant="ghost" full onClick={() => trustRoute(rt)} busy={convBusy === assetId(rt.dest)} disabled={!!convBusy}>
                          Add {assetLabel(rt.dest)} trustline first (changeTrust)
                        </Button>
                      ) : (
                        <Button variant="primary" full onClick={() => convert(rt)} busy={convBusy === assetId(rt.dest)} disabled={!!convBusy || !min}>
                          Convert to {assetLabel(rt.dest)}
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-tape-deep">{noPathMessage(convSource, rt.dest)}.</p>
                )}
              </li>
            );
          })}
          {conv.routes.every((rt) => !rt.best) && (
            <li className={NOTE}>
              Horizon found no route from {assetLabel(convSource)} at all. Tukar does not place offers to fake one; re-quote once a market exists.
            </li>
          )}
          {conv.need && (
            <li className={NOTE}>
              The anchor is waiting for exactly {conv.need.amount} USDC ({short(anchorIssuer)}).{" "}
              {conv.need.best
                ? `Receiving exactly that costs ≈ ${conv.need.best.sendAmount} ${assetLabel(convSource)} (at most ${sendMaxFor(conv.need.best.sendAmount, Number(conv.slippage) || 1)} at your slippage).`
                : `Strict-receive also finds no route from ${assetLabel(convSource)}.`}
            </li>
          )}
          <li className="font-mono text-[11px] text-ink-3">Quoted {new Date(conv.at).toLocaleTimeString()} from {assetLabel(convSource)}.</li>
        </ul>
      )}
      {conv.hash && (
        <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-ink">
          <a className={LINK} href={txExplorer(conv.hash)} target="_blank" rel="noopener noreferrer">
            path payment tx {short(conv.hash)}
          </a>
          {conv.received && <span className="text-ink-2"> · {conv.received}</span>}
        </p>
      )}
      {conv.error && (
        <p className="mt-1.5 break-words font-mono text-[12px] leading-relaxed text-tape-deep">
          {conv.error}
          {conv.failHash && (
            <>
              {" "}
              <a className={LINK} href={txExplorer(conv.failHash)} target="_blank" rel="noopener noreferrer">
                failed tx {short(conv.failHash)}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );

  // ---- cash-out section (collapsed by default, shown once revealed or withdrawn) ----
  const cashOut = (
    <Expander label="Cash out to fiat">
      {anchorDesk}
      {convertSlip}
      <div className="mt-3">
        {needsConvert && <div className={`mb-1.5 ${CAP}`}>Step 2 · Withdraw the anchor&apos;s USDC</div>}
        <Button variant="primary" full onClick={cashOutAnchor} busy={cashBusy === "anchor" && !kycNeedsSlip && !run} disabled={!!cashBusy || (!!run && run.phase !== "done" && run.phase !== "stopped")}>
          Withdraw via anchor (SEP-24)
        </Button>
        <p className={`mt-1.5 ${NOTE}`}>
          Spends the anchor&apos;s own USDC{anchorIssuer ? ` (issuer ${short(anchorIssuer)})` : ""} from {short(activeAddress())}, not the pool&apos;s USDC: {ANCHOR.home} only takes and pays out its own asset.
        </p>
      </div>
      {sep24Slip}
      <div className="mt-3 border-t border-ink/25 pt-3">
        <Button variant="ghost" full onClick={priceReference} busy={cashBusy === "onramper"} disabled={!!cashBusy}>
          {cor.currency} mainnet price reference (Onramper)
        </Button>
        {priceRef}
      </div>
      <p className={`mt-2.5 ${NOTE}`}>
        A licensed provider (a SEP-24 anchor, or on mainnet Onramper routing to MoonPay or Transak) runs KYC and pays out the fiat. Tukar never touches the money.
      </p>
    </Expander>
  );

  // ---- withdrawn (done) card ----
  if (done) {
    const spent = note.withdrawn === "spent";
    return (
      <section className={SHEET}>
        <div className={BAR}>
          <span>{note.ref}</span>
          <span>Withdrawn on-chain</span>
          <span className="ml-auto">{cor.code} {cor.currency}</span>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={CAP}>Contents</div>
              <div className={`mt-1 ${AMOUNT}`}>
                ${usdcStr}
                <span className="ml-2 font-sans text-sm font-semibold normal-case text-ink-2">USDC released</span>
              </div>
            </div>
            {/* The stamp lands once: the box is open and the money is out. */}
            <span className={`tk-stamp animate-tk-ring shrink-0 ${spent ? "tk-stamp-ink" : ""}`}>{spent ? "Spent" : "Delivered"}</span>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
            {note.ref}. The note was spent, tokens released to your account.
          </p>
          {note.withdrawn !== "spent" && note.withdrawn !== "ok" && (
            <a className={`mt-2 inline-block ${LINK}`} href={txExplorer(note.withdrawn!)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
          {cashOut}
          {rateAttest}
          {discloseSection}
        </div>
      </section>
    );
  }

  // ---- active (arrival) card ----
  return (
    <section className={SHEET}>
      <div className={BAR}>
        <span>{note.ref}</span>
        <span>Shielded arrival</span>
        <span className="ml-auto">{cor.code} {cor.currency}</span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={CAP}>Contents</div>
            <div className={`mt-1 ${AMOUNT}`}>
              ${usdcStr}
              <span className="ml-2 font-sans text-sm font-semibold text-ink-2">USDC</span>
            </div>
            <div className={`mt-2.5 flex items-center gap-2 ${CAP}`}>
              From <span className="tk-redact" style={{ minWidth: "9ch" }} aria-label="hidden" />
            </div>
          </div>
          <span className={`tk-stamp shrink-0 ${note.revealed ? "" : "tk-stamp-ink"}`}>{note.revealed ? "Revealed" : "Shielded"}</span>
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

        {/* The flap: kraft over the local figure until the receiver lifts it. Under it, the
            customs desk slip: the on-chain quote, its basis, and the records behind the median. */}
        <div className="mt-4">
          {!note.revealed ? (
            <div className="border border-kraft-edge bg-kraft p-3 shadow-inset">
              <Button variant="reveal" full onClick={reveal} busy={quoteBusy} disabled={quoteBusy}>
                Reveal in {cor.currency} →
              </Button>
            </div>
          ) : local != null ? (
            <div className="animate-tk-pop border-t-2 border-dashed border-ink/40 pt-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={CAP}>Customs desk</span>
                <span className="font-mono text-[11px] text-ink-3">{onChainQuote ? "Reflector, read on-chain" : "FX API, not on-chain"}</span>
              </div>
              <div className="mt-1.5 font-stencil tabular-nums text-[clamp(24px,8vw,32px)] leading-none tracking-[0.01em] text-stamp-deep [overflow-wrap:anywhere]">
                + {cor.symbol}
                {fmtLocal(local)} <span className="font-sans text-sm font-semibold text-ink-2">{cor.currency}</span>
              </div>
              <div className={`mt-1.5 ${NOTE}`}>
                Your ${usdcStr} USDC, converted{" "}
                {onChainQuote
                  ? "on-chain from the pool's Reflector quote, priced at the median of 5 records, the same basis the settlement gate enforces." + basisNote
                  : "at the live FX API rate (not on-chain)."}
              </div>
              {onChainQuote && spotQuote != null && (
                <div className={`mt-2.5 border-t border-ink/25 pt-2.5 ${NOTE}`}>
                  <b className="text-ink">Spot</b> {cor.symbol}{fmtLocal(spotQuote)} · <b className="text-ink">Median of 5</b> {cor.symbol}{fmtLocal(local)}. The settlement gate prices on the median of 5 records, so spot can differ and the median is what the withdraw floor enforces.
                </div>
              )}
              {depth()}
            </div>
          ) : cor.oracle ? (
            quoteBusy ? (
              <Spinner label={`Reading the ${cor.currency} figure on-chain.`} />
            ) : gateUsdc < 1 ? (
              <div className="text-[13px] leading-relaxed text-ink-2">
                Under 1 USDC: the pool&apos;s on-chain quote prices whole USDC only, so there is no on-chain {cor.currency} figure for this payment. Cash out below for the provider&apos;s live quote.
              </div>
            ) : (
              <div className="text-[13px] leading-relaxed text-ink-2">
                On-chain FX quote unavailable right now. No live Reflector price could be read, so no figure is shown.
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => readQuote(cor.oracle!, cor.currency)}>
                    Retry on-chain quote
                  </Button>
                </div>
              </div>
            )
          ) : (
            <div className="text-[13px] leading-relaxed text-ink-2">
              Live {cor.currency} rate unavailable right now. This corridor prices from a live FX API, not on-chain. Cash out below for the provider&apos;s live quote.
            </div>
          )}
        </div>

        {/* Attached form: what this costs elsewhere, and the Blend savings slip. */}
        <div className={SLIP + " mt-4"}>
          <div className={CAP}>Attached form</div>
          <SavingsNote usdc={usdc} className="mt-2" />
        </div>

        <div className="mt-4 border-t border-ink/25 pt-4">
          {note.withdrawing ? (
            <Button variant="primary" full busy disabled title="Releasing tokens on-chain, please wait">
              Withdrawing on-chain
            </Button>
          ) : (
            <Button variant="primary" full onClick={withdraw}>
              {gateError ? "Retry withdraw" : "Withdraw on-chain"}
            </Button>
          )}
          {gateError && <p className="mt-2.5 text-[13px] leading-relaxed text-tape-deep">{gateError}</p>}
          {!note.revealed && (
            <p className={`mt-2.5 ${NOTE}`}>
              Reveal first to see your local figure, then withdraw on-chain and cash out.
            </p>
          )}
          {/* Web Push stub: tell this browser when the sender's tree registration lands. */}
          <NotifyMe className="mt-3" commitment={note.commitment} kind="spendable" url="/receiver" label="Notify me when it is ready to withdraw" />
        </div>

        {note.revealed && cashOut}
        {note.revealed && rateAttest}
        {discloseSection}
      </div>
    </section>
  );
}

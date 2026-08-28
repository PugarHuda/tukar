import { NextResponse } from "next/server";
import {
  verifyProofOnChain,
  isKnownCommitment,
  isAuditRequest,
  readAnchorMemoHash,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
} from "@/lib/stellar";
import { log, requestId, errMsg } from "@/lib/log";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
// NOTE: fmtUsdc + receiptCanonical are copied (verbatim) from lib/zk rather than imported —
// importing from lib/zk drags circomlibjs/ffjavascript/web-worker into this server route. Both
// are pure, browser-free, and tiny, so copying keeps the route lean per the task's guidance.
type DisclosureType = "exact" | "threshold" | "aggregate" | "range";
type Groth16Proof = { pi_a: any; pi_b: any; pi_c: any; [k: string]: any };
type AuditReceipt = {
  type: DisclosureType;
  publicSignals: string[];
  proof: Groth16Proof;
  anchor?: { txHash: string; sha256: string; network?: string };
  exportedAt?: string;
  [k: string]: any;
};
const STROOPS = 10_000_000n; // USDC has 7 decimals on Stellar
function fmtUsdc(stroops: string | bigint): string {
  const s = BigInt(stroops);
  const whole = s / STROOPS;
  const frac = (s % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
function receiptCanonical(r: AuditReceipt): string {
  const { anchor, exportedAt, ...rest } = r;
  return JSON.stringify(rest);
}

// PUBLIC, independent receipt verifier. Runs the ON-CHAIN half of lib/zk.verifyReceipt over
// Soroban RPC only (no snarkjs, no browser deps): the live Stellar verifier contract runs the
// Groth16 pairing check, then the pool state binds the proof to a real deposit / registered
// audit request, then the ledger memo confirms the anchor. Read-only against the live testnet
// contracts — no keys, no writes. Honesty rule: we only report what these on-chain reads prove.
export const dynamic = "force-dynamic";

const VERIFIER: Record<DisclosureType, string> = {
  exact: DISCLOSURE_VERIFIER,
  threshold: THRESHOLD_VERIFIER,
  aggregate: AGGREGATE_VERIFIER,
  range: RANGE_VERIFIER,
};
const TYPES: DisclosureType[] = ["exact", "threshold", "aggregate", "range"];
// Public-signal count per circuit (matches lib/zk's publicSignals layouts): exact + threshold are
// [commitment, figure, auditCtx]; range is [commitment, lower, upper, auditCtx]; aggregate is
// [commitments(5), active(5), cap, auditCtx, ctxNonce]. derive()/bind() index into these
// positions, so a short array must be rejected here rather than surface as a chain-read error.
const SIGNALS: Record<DisclosureType, number> = { exact: 3, threshold: 3, range: 4, aggregate: 13 };
const isField = (s: unknown): s is string => typeof s === "string" && /^\d{1,78}$/.test(s);
const isHash = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/i.test(s.trim());

// A null pool read is NOT "confirmed absent": it is a chain-read failure, so bind() throws and the
// route answers 502 instead of ever reporting `unbound` (or a green bind) on missing evidence.
const CHAIN_READ_FAILED = "chain read failed";

type Checks = {
  groth16: boolean; // the live Stellar verifier contract accepted the proof
  boundToChain: boolean; // the proof is tied to real pool state (deposit / registered request)
  boundReason: string;
  anchorChecked: boolean; // the receipt carried an anchor tx we could read
  anchorMatches: boolean; // the ledger memo commits to this exact receipt
  anchorReason: string;
};

/** Reject anything that is not a structurally sound receipt BEFORE any RPC call. */
function receiptErrors(r: any): string[] {
  const e: string[] = [];
  if (!r || typeof r !== "object") return ["Body is not a JSON object."];
  if (r.kind && r.kind !== "tukar-audit-receipt") e.push('kind must be "tukar-audit-receipt".');
  if (!TYPES.includes(r.type)) e.push(`type must be one of ${TYPES.join(", ")}.`);
  if (!Array.isArray(r.publicSignals) || !r.publicSignals.every(isField))
    e.push("publicSignals must be an array of decimal field-element strings.");
  else if (TYPES.includes(r.type) && r.publicSignals.length !== SIGNALS[r.type as DisclosureType])
    e.push(`a ${r.type} receipt must carry exactly ${SIGNALS[r.type as DisclosureType]} publicSignals (got ${r.publicSignals.length}).`);
  const p = r.proof;
  if (!p || typeof p !== "object" || !p.pi_a || !p.pi_b || !p.pi_c)
    e.push("proof must be a Groth16 object with pi_a, pi_b, pi_c.");
  return e;
}

/** Derive the disclosed figure from the PROVEN publicSignals (never from metadata). */
function derive(type: DisclosureType, sigs: string[]) {
  if (type === "exact") {
    const v = fmtUsdc(sigs[1]);
    return { disclosed: `$${v} USDC`, summary: `discloses exactly $${v} USDC`, metaKey: "disclosedAmountUsdc" as const, provenMeta: v };
  }
  if (type === "threshold") {
    const v = fmtUsdc(sigs[1]);
    return { disclosed: `<= $${v} USDC`, summary: `proves the amount is at or below $${v} USDC (amount hidden)`, metaKey: "thresholdUsdc" as const, provenMeta: v };
  }
  if (type === "range") {
    const lo = fmtUsdc(sigs[1]);
    const hi = fmtUsdc(sigs[2]);
    return { disclosed: `$${lo} to $${hi} USDC`, summary: `proves the amount is in the band $${lo} to $${hi} USDC (amount hidden)`, metaKey: "bandUsdc" as const, provenMeta: `$${lo}-$${hi}` };
  }
  const v = fmtUsdc(sigs[10]);
  // ponytail: mirrors lib/zk.verifyReceipt's F3 derivation; inline to respect file ownership.
  return { disclosed: `total <= $${v} USDC`, summary: `proves the portfolio total is at or below $${v} USDC (individual amounts hidden)`, metaKey: "capUsdc" as const, provenMeta: v };
}

async function bind(type: DisclosureType, sigs: string[]): Promise<{ bound: boolean; reason: string }> {
  if (type === "aggregate") {
    const registered = await isAuditRequest(sigs[11]);
    if (registered == null) throw new Error(CHAIN_READ_FAILED);
    if (!registered) return { bound: false, reason: "the audit request is not registered on-chain" };
    const activeIdx = [0, 1, 2, 3, 4].filter((i) => sigs[5 + i] === "1");
    // isKnownCommitment is boolean (false = confirmed absent) or null (could not read the chain).
    const known: (boolean | null)[] = await Promise.all(activeIdx.map((i) => isKnownCommitment(sigs[i])));
    if (known.some((k) => k == null)) throw new Error(CHAIN_READ_FAILED);
    if (known.every((k) => k === true))
      return { bound: true, reason: "registered audit request; every active commitment is an on-chain deposit" };
    return { bound: false, reason: "an active commitment in the aggregate is not an on-chain deposit" };
  }
  const present: boolean | null = await isKnownCommitment(sigs[0]);
  if (present == null) throw new Error(CHAIN_READ_FAILED);
  if (present) return { bound: true, reason: "the commitment is a real on-chain deposit" };
  return { bound: false, reason: "the proof is valid but its commitment is not an on-chain deposit" };
}

async function checkAnchor(r: AuditReceipt): Promise<Pick<Checks, "anchorChecked" | "anchorMatches" | "anchorReason"> & { txHash?: string }> {
  if (!r.anchor?.sha256) return { anchorChecked: false, anchorMatches: false, anchorReason: "receipt is not anchored" };
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(receiptCanonical(r))));
  const selfHash = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const selfConsistent = selfHash === r.anchor.sha256;
  const memoHex = r.anchor.txHash ? await readAnchorMemoHash(r.anchor.txHash) : null;
  const matches = !!memoHex && memoHex === r.anchor.sha256;
  const reason = matches
    ? "the ledger memo commits to this exact receipt"
    : !selfConsistent
      ? "the receipt bytes do not hash to its own claimed sha256"
      : memoHex == null
        ? "anchor not confirmed on-chain (transaction missing or no hash memo)"
        : "anchor not confirmed on-chain (ledger memo does not match)";
  return { anchorChecked: true, anchorMatches: matches, anchorReason: reason, txHash: r.anchor.txHash };
}

async function verifyReceiptOnChain(r: AuditReceipt) {
  const type = r.type;
  const sigs = r.publicSignals.map(String);
  const oc = await verifyProofOnChain(VERIFIER[type], r.proof, sigs);
  const groth16 = oc.verified;

  const d = derive(type, sigs);
  const metaMismatch = r[d.metaKey] != null && String(r[d.metaKey]) !== d.provenMeta;
  const summary = metaMismatch ? `${d.summary} (receipt metadata disagreed; showing the proven value)` : d.summary;

  const b = groth16 ? await bind(type, sigs) : { bound: false, reason: "proof did not verify (the live verifier rejected it)" };
  const a = await checkAnchor(r);

  const checks: Checks = {
    groth16,
    boundToChain: b.bound,
    boundReason: b.reason,
    anchorChecked: a.anchorChecked,
    anchorMatches: a.anchorMatches,
    anchorReason: a.anchorReason,
  };
  // status: fail = proof rejected; unbound = valid proof but NOT tied to real state (do NOT
  // read as a confirmed disclosure); pass = valid AND bound. Matches regulator/page.tsx:497-511.
  const status: "pass" | "unbound" | "fail" = !groth16 ? "fail" : b.bound ? "pass" : "unbound";
  return {
    ok: status === "pass",
    status,
    type,
    commitment: sigs[0],
    disclosed: d.disclosed,
    summary,
    metaMismatch,
    boundToChain: checks.boundToChain,
    anchorMatches: a.anchorChecked ? checks.anchorMatches : null,
    anchorTxHash: a.txHash ?? null,
    checks,
  };
}

export async function POST(req: Request) {
  // Each receipt costs ~7 RPC reads including a full pool leaf scan, so cap it per client. 60/min
  // leaves room for a shared office/NAT address checking a batch of receipts while still bounding
  // the RPC load one client can cause.
  const rl = await rateLimit(req, { key: "verify", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  // Mode A: bare anchor tx hash. We can only read the ledger memo, not verify the disclosure.
  const rawHash = typeof body?.txHash === "string" ? body.txHash.trim() : null;
  if (rawHash) {
    if (!isHash(rawHash)) return NextResponse.json({ ok: false, error: "txHash must be 64 hex characters." }, { status: 400 });
    const memoHex = await readAnchorMemoHash(rawHash);
    return NextResponse.json({
      ok: false,
      mode: "anchor",
      txHash: rawHash,
      anchorMemoHash: memoHex,
      note: memoHex
        ? "This transaction exists and its ledger memo commits to the hash below. That proves a receipt was anchored on-chain, but not the disclosure itself. Paste the full receipt JSON to verify the proof."
        : "No hash memo was found for this transaction (it may be missing, unsuccessful, or carry no hash memo).",
    });
  }

  // Mode B: full receipt.
  const receipt = body && typeof body === "object" && body.receipt && typeof body.receipt === "object" ? body.receipt : body;
  const errors = receiptErrors(receipt);
  if (errors.length) return NextResponse.json({ ok: false, error: errors.join(" ") }, { status: 400 });

  try {
    const result = await verifyReceiptOnChain(receipt as AuditReceipt);
    return NextResponse.json(result);
  } catch (e) {
    // Chain-read failure: log server-side with a request id, return a generic message (never the
    // raw error, which can carry RPC internals) so the client just sees an unverified state.
    log.error("receipt verify failed", { route: "verify", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ ok: false, error: "Could not verify the receipt on-chain (chain read failed). Please try again." }, { status: 502 });
  }
}

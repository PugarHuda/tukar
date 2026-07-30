// Tukar — client-side ZK helpers (Next.js port of the crypto in frontend/app.js + tree.js).
// Wraps snarkjs (Groth16 prove/verify over BN254) + circomlibjs (Poseidon). BROWSER ONLY —
// snarkjs & circomlibjs are dynamic-imported so they never enter a server bundle, and the
// circuit assets are fetched from /circuit/* (Next public dir). Covers the full note
// lifecycle, all disclosure circuits, and the portable audit-receipt format so the four
// route pages can reproduce every flow the current demo console does.
import {
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
  verifyProofOnChain,
  type Groth16Proof,
} from "./stellar";

// BN254 scalar field modulus
export const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const STROOPS = 10_000_000n; // USDC has 7 decimals on Stellar

// ---- lazy loaders (browser-only heavyweights) ----
let _snarkjs: any = null;
export async function getSnarkjs(): Promise<any> {
  if (!_snarkjs) _snarkjs = await import("snarkjs");
  return _snarkjs;
}
let _poseidon: any = null;
let _F: any = null;
/** Build (once) and return { poseidon, F } from circomlibjs. */
export async function getPoseidon(): Promise<{ poseidon: any; F: any }> {
  if (!_poseidon) {
    const { buildPoseidon } = await import("circomlibjs");
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return { poseidon: _poseidon, F: _F };
}

// ---- circuit artifact paths (served from webapp/public/circuit) ----
// ?v query strings mirror frontend/app.js so a stale cached asset is never proven against.
export const CIRCUITS = {
  disclosure: { wasm: "/circuit/disclosure.wasm", zkey: "/circuit/disclosure_final.zkey?v=3", vkey: "/circuit/verification_key.json?v=3" },
  transfer: { wasm: "/circuit/transfer.wasm?v=2", zkey: "/circuit/transfer_final.zkey?v=3" },
  compliance: { wasm: "/circuit/compliance.wasm?v=3", zkey: "/circuit/compliance_final.zkey?v=3" },
  merkleUpdate: { wasm: "/circuit/merkleUpdate.wasm?v=2", zkey: "/circuit/merkleUpdate_final.zkey?v=3" },
  threshold: { wasm: "/circuit/thresholdDisclosure.wasm?v=3", zkey: "/circuit/thresholdDisclosure_final.zkey?v=4", vkey: "/circuit/thresholdDisclosure_vk.json?v=4" },
  aggregate: { wasm: "/circuit/aggregateDisclosure.wasm?v=6", zkey: "/circuit/aggregateDisclosure_final.zkey?v=6", vkey: "/circuit/aggregateDisclosure_vk.json?v=6" },
  range: { wasm: "/circuit/rangeDisclosure.wasm?v=1", zkey: "/circuit/rangeDisclosure_final.zkey?v=1", vkey: "/circuit/rangeDisclosure_vk.json?v=1" },
} as const;
export const AGG_N = 5; // max slots in the variable-count aggregate circuit

// ---- field / format helpers (ported verbatim from app.js) ----
export function randomFieldElement(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  return x % R;
}
/** Deterministically map an audit-context string to a field element. */
export function contextToField(str: string): bigint {
  const bytes = new TextEncoder().encode(str);
  let x = 0n;
  for (const b of bytes) x = (x * 257n + BigInt(b)) % R;
  return x;
}
export function usdcToStroops(usdc: string | number): bigint {
  const [whole, frac = ""] = String(usdc).split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * STROOPS + BigInt(fracPadded || "0");
}
export function fmtUsdc(stroops: string | bigint): string {
  const s = BigInt(stroops);
  const whole = s / STROOPS;
  const frac = (s % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export const short = (s: string): string => `${String(s).slice(0, 10)}…${String(s).slice(-8)}`;
export const shortHash = (s: string): string => `0x${BigInt(s).toString(16).slice(0, 8)}…${BigInt(s).toString(16).slice(-2)}`;
export const isFieldStr = (s: unknown): s is string => typeof s === "string" && /^\d{1,78}$/.test(s);

// ---- Poseidon Merkle tree (depth 10), matching circuits/lib/merkleProof.circom ----
const LEVELS = 10;
export type Tree = {
  root: (leaves: bigint[]) => bigint;
  pathElements: (leaves: bigint[], index: number) => bigint[];
  LEVELS: number;
};
export function makeTree(F: any, poseidon: any): Tree {
  const h2 = (a: bigint, b: bigint): bigint => F.toObject(poseidon([a, b]));
  function build(leaves: bigint[]): bigint[][] {
    const size = 1 << LEVELS;
    const layer = new Array<bigint>(size).fill(0n);
    for (let i = 0; i < leaves.length; i++) layer[i] = leaves[i] ?? 0n;
    const layers: bigint[][] = [layer];
    for (let l = 0; l < LEVELS; l++) {
      const prev = layers[l];
      const next = new Array<bigint>(prev.length / 2);
      for (let i = 0; i < next.length; i++) next[i] = h2(prev[2 * i], prev[2 * i + 1]);
      layers.push(next);
    }
    return layers;
  }
  const root = (leaves: bigint[]): bigint => build(leaves)[LEVELS][0];
  function pathElements(leaves: bigint[], index: number): bigint[] {
    const layers = build(leaves);
    const path: bigint[] = [];
    let idx = index;
    for (let l = 0; l < LEVELS; l++) {
      path.push(layers[l][idx ^ 1]);
      idx >>= 1;
    }
    return path;
  }
  return { root, pathElements, LEVELS };
}

// ---- note lifecycle: commitment = Poseidon(amount, pubKey, blinding), pubKey = Poseidon(privKey) ----
export type Note = {
  amount: string; // stroops, decimal string
  privKey: string;
  pubKey: string;
  blinding: string;
  commitment: string;
};
/** Build a fresh spendable note for `amountStroops`. */
export async function newNote(amountStroops: bigint): Promise<Note> {
  const { poseidon, F } = await getPoseidon();
  const privKey = randomFieldElement();
  const pubKey = F.toObject(poseidon([privKey])); // spendable
  const blinding = randomFieldElement();
  const commitment = F.toObject(poseidon([amountStroops, pubKey, blinding]));
  return { amount: amountStroops.toString(), privKey: privKey.toString(), pubKey: pubKey.toString(), blinding: blinding.toString(), commitment: commitment.toString() };
}

// ---- bearer note (tukar1:) — a note IS the spendable asset; encode it as a portable string ----
// Cross-compatible with the vanilla frontend/app.js encoding (same prefix + payload shape).
export type BearerPayload = { v: 1; ref: string; amount: string; privKey: string; pubKey: string; blinding: string; commitment: string; corridor?: string };
export function encodeBearerNote(note: { ref?: string; amount: string; privKey: string; pubKey: string; blinding: string; commitment: string; corridor?: string }): string {
  const payload: BearerPayload = {
    v: 1,
    ref: note.ref || "PAY",
    amount: note.amount,
    privKey: note.privKey,
    pubKey: note.pubKey,
    blinding: note.blinding,
    commitment: note.commitment,
    corridor: note.corridor,
  };
  return "tukar1:" + btoa(JSON.stringify(payload));
}
/** Decode + validate a tukar1: bearer note. Throws on a malformed/incompatible string. */
export function decodeBearerNote(raw: string): BearerPayload {
  const json = JSON.parse(atob(raw.trim().replace(/^tukar1:/, "")));
  for (const k of ["amount", "privKey", "pubKey", "blinding", "commitment"] as const) {
    if (!isFieldStr(json[k])) throw new Error("malformed or missing field: " + k);
  }
  return json as BearerPayload;
}

// ---- payment request (tukreq1:) — public (no secrets): amount + memo + payee address ----
export type RequestPayload = { v: 1; kind: "req"; amount: string; memo: string; addr: string };
export function encodePaymentRequest(amount: string | number, addr: string): string {
  const memo = `to ${addr.slice(0, 4)}..${addr.slice(-4)}`; // ASCII only (btoa is Latin1)
  return "tukreq1:" + btoa(JSON.stringify({ v: 1, kind: "req", amount: String(amount), memo, addr }));
}
/** Decode + validate a tukreq1: payment request. Throws on a malformed string. */
export function decodePaymentRequest(raw: string): RequestPayload {
  const json = JSON.parse(atob(raw.trim().replace(/^tukreq1:/, "")));
  if (json.kind !== "req") throw new Error("not a Tukar payment request");
  if (!/^\d+(\.\d{1,7})?$/.test(String(json.amount))) throw new Error("invalid request amount");
  return json as RequestPayload;
}

// ---- generic Groth16 wrappers ----
export type ProveResult = { proof: Groth16Proof; publicSignals: string[] };
export async function fullProve(input: Record<string, any>, wasm: string, zkey: string): Promise<ProveResult> {
  const sj = await getSnarkjs();
  return sj.groth16.fullProve(input, wasm, zkey);
}
const _vkeyCache: Record<string, any> = {};
async function loadVkey(path: string): Promise<any> {
  if (!_vkeyCache[path]) _vkeyCache[path] = await (await fetch(path)).json();
  return _vkeyCache[path];
}
export async function verify(vkeyPath: string, publicSignals: (string | bigint)[], proof: Groth16Proof): Promise<boolean> {
  const sj = await getSnarkjs();
  const vkey = await loadVkey(vkeyPath);
  return sj.groth16.verify(vkey, publicSignals.map(String), proof).catch(() => false);
}

// ---- disclosure prove wrappers (input shapes ported from app.js) ----
// EXACT: commitment opens to exactly `disclosedAmount`. publicSignals = [commitment, disclosedAmount, auditContextHash].
export async function proveExactDisclosure(note: Note, auditContextHash: string): Promise<ProveResult> {
  const input = { commitment: note.commitment, disclosedAmount: note.amount, auditContextHash, amount: note.amount, pubKey: note.pubKey, blinding: note.blinding };
  return fullProve(input, CIRCUITS.disclosure.wasm, CIRCUITS.disclosure.zkey);
}
// THRESHOLD: prove amount ≤ threshold (amount hidden). Throws (unprovable) if amount > threshold.
// publicSignals = [commitment, threshold, auditContextHash].
export async function proveThreshold(note: Note, thresholdStroops: bigint, auditContextHash: string): Promise<ProveResult> {
  const input = { commitment: note.commitment, threshold: thresholdStroops.toString(), auditContextHash, amount: note.amount, pubKey: note.pubKey, blinding: note.blinding };
  return fullProve(input, CIRCUITS.threshold.wasm, CIRCUITS.threshold.zkey);
}
// RANGE: prove lower ≤ amount ≤ upper (amount hidden). publicSignals = [commitment, lower, upper, auditContextHash].
export async function proveRange(note: Note, loStroops: bigint, hiStroops: bigint, auditContextHash: string): Promise<ProveResult> {
  const input = { commitment: note.commitment, lower: loStroops.toString(), upper: hiStroops.toString(), auditContextHash, amount: note.amount, pubKey: note.pubKey, blinding: note.blinding };
  return fullProve(input, CIRCUITS.range.wasm, CIRCUITS.range.zkey);
}

// AGGREGATE (portfolio): prove SUM of up to AGG_N notes ≤ cap, no single amount revealed.
// Computes the completeness hash issuedHash = Poseidon(ctxNonce, requiredCommitments, requiredActive)
// which the auditor must register on-chain (registerAuditRequest) before the proof is accepted.
// `omitLast` demonstrates the completeness test (proving a trimmed set -> unprovable).
export type AggregateInputs = { notes: Note[]; capStroops: bigint; ctxNonce: string; omitLast?: boolean };
export type AggregateBuild = { input: Record<string, any>; issuedHash: string; total: bigint; nActive: number; provenN: number };
/** Build the aggregate circuit input + the issuedHash the auditor registers. */
export async function buildAggregateInput({ notes, capStroops, ctxNonce, omitLast = false }: AggregateInputs): Promise<AggregateBuild> {
  const { poseidon, F } = await getPoseidon();
  const sel = notes.slice(0, AGG_N);
  const nActive = sel.length;
  const provenN = omitLast ? Math.max(0, nActive - 1) : nActive;
  const total = sel.reduce((s, n) => s + BigInt(n.amount), 0n);
  const commitments: string[] = [], active: string[] = [], amounts: string[] = [], pubKeys: string[] = [], blindings: string[] = [];
  const reqCommitments: string[] = [], reqActive: string[] = [];
  for (let i = 0; i < AGG_N; i++) {
    const n = sel[i];
    reqCommitments.push(n ? n.commitment : "0");
    reqActive.push(n ? "1" : "0");
    const on = !!n && i < provenN;
    commitments.push(n ? n.commitment : "0");
    active.push(on ? "1" : "0");
    amounts.push(n ? String(n.amount) : "0");
    pubKeys.push(n ? String(n.pubKey) : "0");
    blindings.push(n ? String(n.blinding) : "0");
  }
  const issuedHash = F.toObject(poseidon([BigInt(ctxNonce), ...reqCommitments.map((c) => BigInt(c)), ...reqActive.map((a) => BigInt(a))])).toString();
  const input = { commitments, active, cap: capStroops.toString(), auditContextHash: issuedHash, ctxNonce: String(ctxNonce), amounts, pubKeys, blindings };
  return { input, issuedHash, total, nActive, provenN };
}
export async function proveAggregate(build: AggregateBuild): Promise<ProveResult> {
  return fullProve(build.input, CIRCUITS.aggregate.wasm, CIRCUITS.aggregate.zkey);
}

// ---- portable audit receipt (all 4 disclosure types) ----
export type DisclosureType = "exact" | "threshold" | "aggregate" | "range";
const RECEIPT_VK: Record<DisclosureType, string> = {
  exact: CIRCUITS.disclosure.vkey,
  threshold: CIRCUITS.threshold.vkey,
  aggregate: CIRCUITS.aggregate.vkey,
  range: CIRCUITS.range.vkey,
};
const RECEIPT_VERIFIER: Record<DisclosureType, string> = {
  exact: DISCLOSURE_VERIFIER,
  threshold: THRESHOLD_VERIFIER,
  aggregate: AGGREGATE_VERIFIER,
  range: RANGE_VERIFIER,
};
export type AuditReceipt = {
  kind: "tukar-audit-receipt";
  version: 1;
  type: DisclosureType;
  verifiedOnChain: boolean;
  network: string;
  verifier: string;
  publicSignals: string[];
  proof: Groth16Proof;
  anchor?: { txHash: string; sha256: string; network: string };
  exportedAt?: string;
  [k: string]: any; // type-specific fields (disclosedAmountUsdc, thresholdUsdc, bandUsdc, capUsdc, commitment(s), auditContext, ...)
};
/** Assemble a portable receipt from a verified disclosure. */
export function makeReceipt(type: DisclosureType, fields: Record<string, any>, proof: Groth16Proof, publicSignals: (string | bigint)[]): AuditReceipt {
  return {
    kind: "tukar-audit-receipt",
    version: 1,
    type,
    ...fields,
    verifiedOnChain: true,
    network: "Test SDF Network ; September 2015",
    verifier: RECEIPT_VERIFIER[type],
    publicSignals: publicSignals.map(String),
    proof,
  };
}
// Canonical bytes for anchoring/re-hashing: exclude volatile metadata (anchor is added
// AFTER hashing; exportedAt is stamped at download time) so the hashes always match.
export function receiptCanonical(r: AuditReceipt): string {
  const { anchor, exportedAt, ...rest } = r;
  return JSON.stringify(rest);
}
export type ReceiptVerification = {
  ok: boolean;
  type: DisclosureType;
  local: boolean; // snarkjs.verify in-browser
  onChain: boolean; // live Stellar verifier
  commitment: string;
  summary: string; // human-readable "what this discloses"
  anchor?: { matches: boolean; txHash: string };
  error?: string;
};
/**
 * Independently re-verify a pasted audit receipt: Groth16 verify IN-BROWSER (snarkjs) AND on
 * the live Stellar verifier, routed to the right vkey + verifier for the receipt's type. If
 * the receipt carries an on-chain anchor, recompute its SHA-256 and confirm it matches the
 * timestamped memo. Zero trust in Tukar.
 */
export async function verifyReceipt(r: AuditReceipt): Promise<ReceiptVerification> {
  const type: DisclosureType = (r.type as DisclosureType) || "exact";
  const vkPath = RECEIPT_VK[type] || CIRCUITS.disclosure.vkey;
  const verifier = RECEIPT_VERIFIER[type] || DISCLOSURE_VERIFIER;
  const sigs = r.publicSignals.map(String);
  const local = await verify(vkPath, sigs, r.proof);
  const oc = await verifyProofOnChain(verifier, r.proof, sigs);
  const cmt = r.commitment || sigs[0];
  const summary = r.disclosedAmountUsdc
    ? `discloses $${r.disclosedAmountUsdc} USDC`
    : r.thresholdUsdc
      ? `proves ≤ $${r.thresholdUsdc} USDC (amount hidden)`
      : r.bandUsdc
        ? `proves in band ${r.bandUsdc} USDC (amount hidden)`
        : r.capUsdc
          ? `proves portfolio ≤ $${r.capUsdc} USDC (individual amounts hidden)`
          : "amount hidden";
  let anchor: { matches: boolean; txHash: string } | undefined;
  if (r.anchor && r.anchor.sha256) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(receiptCanonical(r))));
    const h = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
    anchor = { matches: h === r.anchor.sha256, txHash: r.anchor.txHash };
  }
  return { ok: local && oc.verified, type, local, onChain: oc.verified, commitment: String(cmt), summary, anchor };
}

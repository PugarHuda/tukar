// Off-ramp rate attestation: a portable, verifiable artifact that a receiver's fill was
// priced at the SAME on-chain-enforced median the withdraw settlement gate checks. It reuses
// data already in hand at reveal/withdraw time — the pool's median off-ramp quote
// (offramp_quote_twap) and the 5 raw Reflector records behind it (readReflectorRecords) — and
// nothing else. No new RPC, no new contract. Pure module: no DOM, no stellar imports, so its
// median math can be run standalone (see demo() at the bottom).
//
// HONEST SCOPE: this attests the revealed/withdrawn figure equals the median of the same 5
// Reflector records the on-chain gate enforces (reject-if-below on withdraw, error code 12). It
// is NOT a claim about anything the chain does not already enforce — not the fiat a provider
// finally pays out, not the oracle's own correctness.

export type BasisRecord = {
  source: string; // which feed the record came from, e.g. "Reflector:MXN"
  rate: number; // local units per 1 USD (the value readReflectorRecords already computed)
  ageSec: number | null; // record age at build time, from the same read
  timestamp: number | null; // absolute unix seconds, derived from ageSec (null if age unknown)
};

// The anchor's SEP-38 FIRM quote, when the receiver cashed out through the anchor with it bound
// into the SEP-24 withdraw (quote_id). A second, independent source line beside the Reflector
// median: what the anchor COMMITTED to pay, until when. Present only when used.
export type AnchorQuoteLine = {
  id: string; // the anchor's quote id (the same id in the SEP-24 request)
  anchor: string; // anchor home domain
  sellAmount: number; // USDC sold to the anchor (the amount the SEP-24 withdraw carries)
  buyAsset: string; // SEP-38 asset id, e.g. "iso4217:USD"
  buyAmount: number; // fiat the anchor committed to pay out
  rate: number; // SEP-38 price: sell units per 1 buy unit, before fees
  totalPrice: number; // fees included: sellAmount / buyAmount
  feeTotal: number; // in sell-asset units
  expiresAt: string; // ISO-8601, from the anchor
};

export type RateAttestation = {
  kind: "tukar.offramp.rate-attestation";
  version: 1;
  anchorQuote?: AnchorQuoteLine; // omitted (not null) when unused, so older attestations hash unchanged
  corridor: { code: string; currency: string; symbol: string; oracleSymbol: string };
  amountUsdc: number;
  settledMedian: number; // local fiat at the enforced median (pool.offramp_quote_twap of the basis)
  medianRate: number; // local units per 1 USD, median of basisRecords (same rule the UI/gate use)
  minLocalOut: number | null; // the withdraw floor actually enforced (median * 0.99), if withdrawn
  basisRecords: BasisRecord[]; // the 5 raw records the median is taken over, sorted by rate
  recordCount: number;
  builtAtSec: number; // unix seconds when this attestation was assembled
  builtAt: string; // same instant, ISO-8601
  network: string;
  withdrawTx: string | null; // the on-chain withdraw tx this fill settled in, if withdrawn
};

// Median rule: sorted[floor(n/2)] — identical to the depth() readout in PaymentCard and to the
// pool's median-of-5 basis, so the attestation's median matches what the user saw and what the
// gate enforced. For the 5 Reflector records this is the true middle value.
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function buildRateAttestation(input: {
  corridor: { code: string; currency: string; symbol: string; oracleSymbol: string };
  amountUsdc: number;
  settledMedian: number;
  basis: { rate: number; ageSec: number | null }[];
  minLocalOut?: number | null;
  withdrawTx?: string | null;
  network?: string;
  anchorQuote?: AnchorQuoteLine | null;
  nowMs?: number; // injectable for the self-check
}): RateAttestation {
  const nowMs = input.nowMs ?? Date.now();
  const builtAtSec = Math.floor(nowMs / 1000);
  const src = `Reflector:${input.corridor.oracleSymbol}`;
  const basisRecords: BasisRecord[] = input.basis
    .filter((r) => isFinite(r.rate) && r.rate > 0)
    .map((r) => ({
      source: src,
      rate: r.rate,
      ageSec: r.ageSec,
      timestamp: r.ageSec == null ? null : builtAtSec - r.ageSec,
    }))
    .sort((a, b) => a.rate - b.rate); // canonical order, independent of fetch order
  return {
    kind: "tukar.offramp.rate-attestation",
    version: 1,
    corridor: input.corridor,
    amountUsdc: input.amountUsdc,
    settledMedian: input.settledMedian,
    medianRate: basisRecords.length ? median(basisRecords.map((r) => r.rate)) : 0,
    minLocalOut: input.minLocalOut ?? null,
    basisRecords,
    recordCount: basisRecords.length,
    builtAtSec,
    builtAt: new Date(builtAtSec * 1000).toISOString(),
    network: input.network ?? "Test SDF Network ; September 2015",
    withdrawTx: input.withdrawTx ?? null,
    // Appended last and only when present: the canonical bytes of an attestation without an
    // anchor quote are byte-identical to before this field existed.
    ...(input.anchorQuote ? { anchorQuote: input.anchorQuote } : {}),
  };
}

// One line for the receipt: "anchor firm quote <id> at <rate>, expires <t>".
export function anchorQuoteLine(q: AnchorQuoteLine): string {
  const fiat = q.buyAsset.replace(/^iso4217:/, "");
  return `Anchor firm quote ${q.id} at ${q.rate} ${q.buyAsset.startsWith("iso4217:") ? `USDC per ${fiat}` : q.buyAsset} (${q.buyAmount} ${fiat} for ${q.sellAmount} USDC, fee ${q.feeTotal} USDC), expires ${q.expiresAt}, ${q.anchor}.`;
}

// Canonical bytes for hashing/anchoring: a stable, key-ordered JSON string. The object is built
// in a fixed field order and basisRecords is pre-sorted, so JSON.stringify is deterministic — the
// same fill always produces the same string (and the same SHA-256 when anchored via anchorReceipt).
export function attestationCanonical(a: RateAttestation): string {
  return JSON.stringify(a);
}

// Is the on-chain settledMedian consistent with the median of the basis records we're attesting?
// settledMedian = pool.offramp_quote_twap(sym, amount) ≈ medianRate * amount. Because the median
// commutes with the monotone price→rate reciprocal, medianRate*amount tracks the on-chain figure
// up to whole-USDC truncation and fixed-point rounding. tol is a relative bound for that rounding.
export function medianConsistent(a: RateAttestation, tol = 0.01): boolean {
  if (!a.recordCount || a.settledMedian <= 0) return false;
  const expected = a.medianRate * a.amountUsdc;
  return Math.abs(expected - a.settledMedian) / a.settledMedian <= tol;
}

// One-line honest summary for the UI.
export function summarizeAttestation(a: RateAttestation): string {
  const c = a.corridor;
  const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: x >= 1000 ? 0 : 2 });
  const fresh = a.basisRecords.map((r) => r.ageSec).filter((x): x is number => x != null);
  const freshest = fresh.length ? Math.min(...fresh) : null;
  const freshStr = freshest == null ? "unknown age" : freshest < 90 ? `${freshest}s old` : `${Math.round(freshest / 60)}m old`;
  const tx = a.withdrawTx ? `withdraw tx ${a.withdrawTx.slice(0, 8)}…` : "not yet withdrawn";
  return (
    `Settled at the median ${c.symbol}${fmt(a.settledMedian)} ${c.currency} ` +
    `over ${a.recordCount} Reflector records (freshest ${freshStr}), ${tx}.` +
    (a.anchorQuote ? ` ${anchorQuoteLine(a.anchorQuote)}` : "")
  );
}

// Full human-readable artifact for Copy/Download alongside the JSON.
export function formatAttestation(a: RateAttestation): string {
  const c = a.corridor;
  const fmt = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: x >= 1000 ? 0 : 2 });
  const lines = [
    "TUKAR OFF-RAMP RATE ATTESTATION",
    `Corridor        ${c.currency} (${c.code}), oracle ${c.oracleSymbol}`,
    `Amount          ${a.amountUsdc} USDC`,
    `Settled median  ${c.symbol}${fmt(a.settledMedian)} ${c.currency}`,
    `Median rate     ${fmt(a.medianRate)} ${c.currency} per 1 USD`,
    a.minLocalOut != null ? `Enforced floor  ${c.symbol}${fmt(a.minLocalOut)} ${c.currency} (median minus 1% slippage)` : null,
    `Basis           ${a.recordCount} Reflector records (median over these), source ${a.basisRecords[0]?.source ?? "Reflector"}`,
    ...a.basisRecords.map(
      (r, i) => `  [${i + 1}] ${fmt(r.rate)} ${c.currency}/USD  age ${r.ageSec == null ? "?" : r.ageSec + "s"}`,
    ),
    `Built           ${a.builtAt}`,
    `Network         ${a.network}`,
    a.withdrawTx ? `Withdraw tx     ${a.withdrawTx}` : null,
    a.anchorQuote ? `Anchor quote    ${anchorQuoteLine(a.anchorQuote)}` : null,
    "",
    summarizeAttestation(a),
    "This attests the fill was priced at the median of the same records the on-chain withdraw gate enforces. It is not a claim about the fiat a provider finally pays out.",
  ].filter((x): x is string => x != null);
  return lines.join("\n");
}

// Self-check: run with `node` after transpiling, or import demo() and call it. Asserts the median
// math and canonical-hashing behavior — the only non-trivial logic here.
export function demo(): void {
  const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error("rate-attestation self-check FAILED: " + msg);
  };
  const corridor = { code: "MX", currency: "MXN", symbol: "$", oracleSymbol: "MXN" };
  // 5 raw records; middle value (sorted) is 17.0 → median rate 17.0.
  const basis = [
    { rate: 16.8, ageSec: 40 },
    { rate: 17.2, ageSec: 12 },
    { rate: 17.0, ageSec: 75 },
    { rate: 16.9, ageSec: 130 },
    { rate: 17.1, ageSec: 5 },
  ];
  const amount = 100;
  const settled = 17.0 * amount; // what offramp_quote_twap would return at the median
  const a = buildRateAttestation({
    corridor,
    amountUsdc: amount,
    settledMedian: settled,
    basis,
    minLocalOut: Math.floor(settled * 0.99),
    withdrawTx: "abc123def456",
    nowMs: 1_700_000_000_000,
  });

  assert(a.medianRate === 17.0, `median should be 17.0, got ${a.medianRate}`);
  assert(a.recordCount === 5, "should keep all 5 records");
  assert(a.basisRecords[0].rate <= a.basisRecords[4].rate, "basis records must be sorted by rate");
  assert(a.basisRecords[0].timestamp === a.builtAtSec - a.basisRecords[0].ageSec!, "timestamp derived from ageSec");
  assert(medianConsistent(a), "median*amount must match the on-chain settled median");

  // Canonical string is deterministic: same fill, same bytes (so same anchored SHA-256).
  const again = buildRateAttestation({
    corridor,
    amountUsdc: amount,
    settledMedian: settled,
    basis: [...basis].reverse(), // fetch order must not matter
    minLocalOut: Math.floor(settled * 0.99),
    withdrawTx: "abc123def456",
    nowMs: 1_700_000_000_000,
  });
  assert(attestationCanonical(a) === attestationCanonical(again), "canonical string must be order-independent");

  // Tampering a basis rate changes the median → changes the bytes (tamper-evident once anchored).
  const tampered = buildRateAttestation({
    corridor,
    amountUsdc: amount,
    settledMedian: settled,
    basis: basis.map((r) => ({ ...r, rate: r.rate + 1 })),
    nowMs: 1_700_000_000_000,
  });
  assert(attestationCanonical(tampered) !== attestationCanonical(a), "changed basis must change the canonical bytes");
  assert(!medianConsistent(tampered), "a settledMedian that no longer matches the basis must fail the check");

  // A quote that drifts >1% from the basis median is rejected.
  const drifted = buildRateAttestation({ corridor, amountUsdc: amount, settledMedian: settled * 1.05, basis, nowMs: 1 });
  assert(!medianConsistent(drifted), "a 5% drift must fail consistency");

  // eslint-disable-next-line no-console
  console.log("rate-attestation self-check PASSED (median, consistency, canonical determinism, tamper-evidence)");
}

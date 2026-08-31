import { describe, it, expect } from "vitest";
import { buildRateAttestation, attestationCanonical, medianConsistent, formatAttestation, summarizeAttestation } from "./rate-attestation";

const corridor = { code: "MX", currency: "MXN", symbol: "$", oracleSymbol: "MXN" };
// 5 raw records; middle value (sorted) is 17.0.
const basis = [
  { rate: 16.8, ageSec: 40 },
  { rate: 17.2, ageSec: 12 },
  { rate: 17.0, ageSec: 75 },
  { rate: 16.9, ageSec: 130 },
  { rate: 17.1, ageSec: 5 },
];
const amount = 100;
const settled = 17.0 * amount;
const NOW = 1_700_000_000_000;

function build(overrides: Partial<Parameters<typeof buildRateAttestation>[0]> = {}) {
  return buildRateAttestation({
    corridor,
    amountUsdc: amount,
    settledMedian: settled,
    basis,
    minLocalOut: Math.floor(settled * 0.99),
    withdrawTx: "abc123def456",
    nowMs: NOW,
    ...overrides,
  });
}

describe("buildRateAttestation median-of-5", () => {
  it("takes sorted[floor(n/2)] as the median", () => {
    const a = build();
    expect(a.medianRate).toBe(17.0);
    expect(a.recordCount).toBe(5);
  });

  it("sorts basis records by rate regardless of input order", () => {
    const a = build();
    expect(a.basisRecords.map((r) => r.rate)).toEqual([16.8, 16.9, 17.0, 17.1, 17.2]);
    // fully reversed input yields the identical sorted output
    const rev = build({ basis: [...basis].reverse() });
    expect(rev.basisRecords.map((r) => r.rate)).toEqual([16.8, 16.9, 17.0, 17.1, 17.2]);
  });

  it("derives each record timestamp from ageSec", () => {
    const a = build();
    for (const r of a.basisRecords) {
      expect(r.timestamp).toBe(a.builtAtSec - (r.ageSec as number));
    }
  });

  it("drops non-finite / non-positive rates before taking the median", () => {
    const a = build({ basis: [...basis, { rate: 0, ageSec: 1 }, { rate: NaN, ageSec: 1 }, { rate: -3, ageSec: 1 }] });
    expect(a.recordCount).toBe(5); // the three junk rates are filtered out
    expect(a.medianRate).toBe(17.0);
  });

  it("returns medianRate 0 when there are no valid records", () => {
    const a = build({ basis: [] });
    expect(a.recordCount).toBe(0);
    expect(a.medianRate).toBe(0);
  });
});

describe("attestationCanonical determinism", () => {
  it("is order-independent (same fill -> same bytes)", () => {
    const a = build();
    const again = build({ basis: [...basis].reverse() });
    expect(attestationCanonical(a)).toBe(attestationCanonical(again));
  });

  it("changes when a basis rate is tampered", () => {
    const a = build();
    const tampered = build({ basis: basis.map((r) => ({ ...r, rate: r.rate + 1 })) });
    expect(attestationCanonical(tampered)).not.toBe(attestationCanonical(a));
  });
});

describe("medianConsistent", () => {
  it("passes when settledMedian matches medianRate * amount", () => {
    expect(medianConsistent(build())).toBe(true);
  });

  it("fails when the basis is tampered so the median no longer matches settledMedian", () => {
    // settledMedian stays 1700 but every rate shifts +1 -> median 18.0 -> expected 1800.
    const tampered = build({ basis: basis.map((r) => ({ ...r, rate: r.rate + 1 })) });
    expect(medianConsistent(tampered)).toBe(false);
  });

  it("rejects a quote that drifts more than the tolerance", () => {
    const drifted = build({ settledMedian: settled * 1.05 });
    expect(medianConsistent(drifted)).toBe(false);
    expect(medianConsistent(drifted, 0.1)).toBe(true); // widen tolerance -> within bound
  });

  it("returns false with no records or a non-positive settledMedian", () => {
    expect(medianConsistent(build({ basis: [] }))).toBe(false);
    expect(medianConsistent(build({ settledMedian: 0 }))).toBe(false);
  });
});

describe("anchor firm quote line (additive)", () => {
  const anchorQuote = {
    id: "3cf48781-f68b-44fd-8c3b-ee4060d369bd",
    anchor: "testanchor.stellar.org",
    sellAmount: 10,
    buyAsset: "iso4217:USD",
    buyAmount: 8.5714,
    rate: 1.0500035,
    totalPrice: 1.1666705555,
    feeTotal: 1,
    expiresAt: "2026-08-30T12:00:00Z",
  };

  it("leaves the canonical bytes of an attestation without a quote unchanged", () => {
    expect(attestationCanonical(build({ anchorQuote: null }))).toBe(attestationCanonical(build()));
    expect("anchorQuote" in build()).toBe(false);
  });

  it("records the anchor's committed id, rate and expiry when used", () => {
    const a = build({ anchorQuote });
    expect(a.anchorQuote).toEqual(anchorQuote);
    expect(attestationCanonical(a)).not.toBe(attestationCanonical(build()));
    const text = formatAttestation(a);
    expect(text).toContain("Anchor quote    Anchor firm quote 3cf48781-f68b-44fd-8c3b-ee4060d369bd at 1.0500035 USDC per USD");
    expect(text).toContain("expires 2026-08-30T12:00:00Z");
    expect(summarizeAttestation(a)).toContain("Anchor firm quote 3cf48781");
    expect(summarizeAttestation(build())).not.toContain("Anchor firm quote");
  });
});

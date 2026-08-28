import { describe, it, expect } from "vitest";
import { minimumFeeBps, feeForAmount, type CctpBurnFee } from "./cctp";

// Pure fee math over Circle's /v2/burn/USDC/fees schedule shape (minimumFee in bps per tier).
const schedule: CctpBurnFee[] = [
  { finalityThreshold: 1000, minimumFee: 1, forwardFee: { low: 90, medium: 110, high: 160 } },
  { finalityThreshold: 2000, minimumFee: 0 },
];

describe("minimumFeeBps", () => {
  it("picks the exact tier", () => {
    expect(minimumFeeBps(schedule, 1000)).toBe(1);
    expect(minimumFeeBps(schedule, 2000)).toBe(0);
  });
  it("falls back to the cheapest tier at or above the requested threshold", () => {
    expect(minimumFeeBps(schedule, 1500)).toBe(0);
    expect(minimumFeeBps(schedule, 1)).toBe(1);
  });
  it("null when nothing covers it", () => {
    expect(minimumFeeBps(schedule, 3000)).toBeNull();
    expect(minimumFeeBps([], 1000)).toBeNull();
  });
});

describe("feeForAmount", () => {
  it("rounds up so maxFee never undercuts the minimum", () => {
    expect(feeForAmount(10_000_000n, 1)).toBe(1_000n); // 10 USDC at 1 bp = 0.001 USDC
    expect(feeForAmount(1n, 1)).toBe(1n); // sub-unit fee rounds up to 1
    expect(feeForAmount(10_000_000n, 0)).toBe(0n);
    expect(feeForAmount(123_456_789n, 100)).toBe(1_234_568n); // 1% of an odd amount, ceiling
  });
  it("rejects negative or fractional inputs", () => {
    expect(() => feeForAmount(-1n, 1)).toThrow();
    expect(() => feeForAmount(1n, 0.5)).toThrow();
  });
});

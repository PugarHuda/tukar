import { describe, it, expect } from "vitest";
import { traditionalRemittanceFee, TRADITIONAL_REMITTANCE_RATE } from "./savings";

// Real assertions for the honest-cost comparison (was a console.assert demo()).
describe("traditionalRemittanceFee", () => {
  it("computes the 6.2% fee and 12x annual for a representative amount", () => {
    const s = traditionalRemittanceFee(500)!;
    expect(s.fee).toBeCloseTo(31, 6); // 500 * 0.062
    expect(s.feeAnnual).toBeCloseTo(372, 6); // 31 * 12
    expect(s.rate).toBe(TRADITIONAL_REMITTANCE_RATE);
    expect(s.amount).toBe(500);
    expect(s.feeText).toBe("$31.00");
    expect(s.amountText).toBe("$500");
    expect(s.feeAnnualText).toBe("$372");
    expect(s.sentence).toContain("$500");
    expect(s.sentence).toContain("$31.00");
  });

  it("formats sub-$100 amounts with two decimals", () => {
    const s = traditionalRemittanceFee(50)!;
    expect(s.fee).toBeCloseTo(3.1, 6);
    expect(s.feeText).toBe("$3.10");
    expect(s.amountText).toBe("$50.00");
  });

  it("scales linearly for large amounts", () => {
    const s = traditionalRemittanceFee(1_000_000)!;
    expect(s.fee).toBeCloseTo(62_000, 6);
    expect(s.feeAnnual).toBeCloseTo(744_000, 6);
  });

  it("returns null for zero, negative, and non-finite amounts", () => {
    expect(traditionalRemittanceFee(0)).toBeNull();
    expect(traditionalRemittanceFee(-5)).toBeNull();
    expect(traditionalRemittanceFee(NaN)).toBeNull();
    expect(traditionalRemittanceFee(Infinity)).toBeNull();
    expect(traditionalRemittanceFee(-Infinity)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { usdcToStroops, fmtUsdc, STROOPS } from "./zk";

// usdcToStroops is the money-input guard the audit flagged: junk / scientific notation /
// over-precise decimals must become a clean typed error or an exact integer stroop count,
// never an unhandled BigInt throw. These assert the guard AS WRITTEN (see zk.ts).
describe("usdcToStroops", () => {
  it("converts normal decimal amounts to exact stroops", () => {
    expect(usdcToStroops("1")).toBe(10_000_000n);
    expect(usdcToStroops("0")).toBe(0n);
    expect(usdcToStroops("1.5")).toBe(15_000_000n);
    expect(usdcToStroops("500")).toBe(5_000_000_000n);
    expect(usdcToStroops("0.0000001")).toBe(1n); // one stroop, the smallest unit
  });

  it("accepts number inputs (rounded to 7 decimals via toFixed)", () => {
    expect(usdcToStroops(1)).toBe(10_000_000n);
    expect(usdcToStroops(1.5)).toBe(15_000_000n);
    expect(usdcToStroops(0)).toBe(0n);
  });

  it("normalizes scientific notation through Number()", () => {
    // "1e5" is not a plain decimal, so the guard routes it through Number -> toFixed(7).
    expect(usdcToStroops("1e5")).toBe(100_000n * STROOPS); // 100000 USDC
    expect(usdcToStroops(1e5)).toBe(100_000n * STROOPS);
    expect(usdcToStroops("1.5e2")).toBe(150n * STROOPS); // 150 USDC
  });

  it("truncates (does not round) beyond 7 decimal places", () => {
    // fracPadded = (frac + "0000000").slice(0,7): pure truncation, no rounding.
    expect(usdcToStroops("1.123456789")).toBe(11_234_567n);
    expect(usdcToStroops("1.99999999")).toBe(19_999_999n);
    expect(usdcToStroops("0.00000001")).toBe(0n); // 8th decimal is below one stroop -> dropped
  });

  it("handles leading-dot decimals via the Number path", () => {
    // ".5" fails the plain-decimal regex but Number(".5") is finite -> "0.5000000".
    expect(usdcToStroops(".5")).toBe(5_000_000n);
  });

  it("trims surrounding whitespace", () => {
    expect(usdcToStroops("  10  ")).toBe(100_000_000n);
  });

  it("rejects the empty string", () => {
    expect(() => usdcToStroops("")).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops("   ")).toThrow(/invalid USDC amount/);
  });

  it("rejects negative amounts (string and number)", () => {
    expect(() => usdcToStroops("-5")).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops(-5)).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops("-0.5")).toThrow(/invalid USDC amount/);
  });

  it("rejects junk / unicode / non-numeric strings", () => {
    expect(() => usdcToStroops("abc")).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops("12abc")).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops("₿100")).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops("1,000")).toThrow(/invalid USDC amount/);
  });

  it("rejects non-finite numbers and nullish input", () => {
    expect(() => usdcToStroops(NaN)).toThrow(/invalid USDC amount/);
    expect(() => usdcToStroops(Infinity)).toThrow(/invalid USDC amount/);
    // @ts-expect-error exercising the runtime nullish guard
    expect(() => usdcToStroops(null)).toThrow(/invalid USDC amount/);
    // @ts-expect-error exercising the runtime nullish guard
    expect(() => usdcToStroops(undefined)).toThrow(/invalid USDC amount/);
  });
});

// fmtUsdc is the inverse used for display; round-tripping guards against off-by-a-decimal drift.
describe("fmtUsdc", () => {
  it("formats stroops back to a trimmed decimal string", () => {
    expect(fmtUsdc(10_000_000n)).toBe("1");
    expect(fmtUsdc(15_000_000n)).toBe("1.5");
    expect(fmtUsdc(1n)).toBe("0.0000001");
    expect(fmtUsdc(0n)).toBe("0");
  });

  it("round-trips with usdcToStroops for representative amounts", () => {
    for (const a of ["0", "1", "1.5", "500", "0.0000001", "123.4567891"]) {
      // 123.4567891 truncates to 7 dp on the way in, so compare against the truncated form.
      const expected = a === "123.4567891" ? "123.4567891" : a;
      expect(fmtUsdc(usdcToStroops(a))).toBe(expected);
    }
  });
});

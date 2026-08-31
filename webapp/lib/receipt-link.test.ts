import { describe, it, expect } from "vitest";
import { encodeReceiptPayload, decodeReceiptPayload, receiptLink, receiptPayloadFromHash, validateReceipt, MAX_LINK_PAYLOAD } from "./receipt-link";
import type { AuditReceipt } from "./zk";

// A structurally faithful receipt (same shape lib/zk.makeReceipt emits). The field elements are
// synthetic 77-digit strings, so the size numbers here match a real receipt's.
const fe = (seed: number) => String(seed).padEnd(77, "7182818284590452353602874713526624977572470936999595749669676277240766303535");
const proof = { pi_a: [fe(1), fe(2), "1"], pi_b: [[fe(3), fe(4)], [fe(5), fe(6)], ["1", "0"]], pi_c: [fe(7), fe(8), "1"], protocol: "groth16", curve: "bn128" };
const exact: AuditReceipt = {
  kind: "tukar-audit-receipt",
  version: 1,
  type: "exact",
  disclosedAmountUsdc: "12.5",
  commitment: fe(9),
  auditContext: "Regulator audit PAY-001",
  auditContextHash: fe(10),
  verifiedOnChain: true,
  network: "Test SDF Network ; September 2015",
  verifier: "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V",
  publicSignals: [fe(9), "125000000", fe(10)],
  proof,
};
const aggregate: AuditReceipt = {
  ...exact,
  type: "aggregate",
  capUsdc: "5000",
  commitments: [fe(11), fe(12), fe(13), fe(14), fe(15)],
  publicSignals: [fe(11), fe(12), fe(13), fe(14), fe(15), "1", "1", "1", "1", "1", "50000000000", fe(16), fe(17)],
  anchor: { txHash: "a".repeat(64), sha256: "b".repeat(64), network: "Test SDF Network ; September 2015" },
};

describe("receipt link", () => {
  it("round-trips a receipt through the fragment payload", async () => {
    const p = await encodeReceiptPayload(exact);
    expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeReceiptPayload(p)).toEqual(exact);
  });

  it("keeps the largest receipt (aggregate + anchor) inside QR byte-mode capacity", async () => {
    const link = await receiptLink(aggregate, "https://tukar-six.vercel.app");
    expect(link.startsWith("https://tukar-six.vercel.app/verify#r=")).toBe(true);
    expect(link.length).toBeLessThan(2953); // QR version 40, ECC L, byte mode
    expect(await decodeReceiptPayload(receiptPayloadFromHash(link)!)).toEqual(aggregate);
  });

  it("reads r= out of a hash, a full URL, or a bare fragment", () => {
    expect(receiptPayloadFromHash("#r=abc")).toBe("abc");
    expect(receiptPayloadFromHash("https://x.test/verify#r=abc&x=1")).toBe("abc");
    expect(receiptPayloadFromHash("x=1&r=abc")).toBe("abc");
    expect(receiptPayloadFromHash("#x=1")).toBeNull();
    expect(receiptPayloadFromHash("")).toBeNull();
  });

  it("rejects corrupted, truncated, and oversized payloads with a clear error", async () => {
    const p = await encodeReceiptPayload(exact);
    await expect(decodeReceiptPayload(p.slice(0, 40))).rejects.toThrow(/corrupted or truncated/);
    await expect(decodeReceiptPayload("not base64!!")).rejects.toThrow(/corrupted or truncated/);
    await expect(decodeReceiptPayload("")).rejects.toThrow(/empty/);
    await expect(decodeReceiptPayload("A".repeat(MAX_LINK_PAYLOAD + 1))).rejects.toThrow(/too large/);
  });

  it("validates the receipt schema on decode", () => {
    expect(() => validateReceipt(null)).toThrow(/not an object/);
    expect(() => validateReceipt({ ...exact, kind: "x" })).toThrow(/not a Tukar/);
    expect(() => validateReceipt({ ...exact, version: 2 })).toThrow(/version/);
    expect(() => validateReceipt({ ...exact, type: "sum" })).toThrow(/disclosure type/);
    expect(() => validateReceipt({ ...exact, publicSignals: ["0x1"] })).toThrow(/publicSignals/);
    expect(() => validateReceipt({ ...exact, proof: { pi_a: [] } })).toThrow(/proof/);
    expect(() => validateReceipt({ ...exact, verifiedOnChain: "yes" })).toThrow(/metadata/);
    expect(() => validateReceipt({ ...exact, anchor: { txHash: "abc", sha256: "b".repeat(64) } })).toThrow(/anchor/);
    expect(validateReceipt(aggregate)).toEqual(aggregate);
  });

  it("refuses a receipt with fewer public signals than its circuit exposes", () => {
    expect(() => validateReceipt({ ...aggregate, publicSignals: aggregate.publicSignals.slice(0, 3) })).toThrow(/aggregate receipt needs 13 public signals, got 3/);
    expect(() => validateReceipt({ ...exact, type: "range" })).toThrow(/range receipt needs 4/);
    expect(() => validateReceipt({ ...exact, publicSignals: exact.publicSignals.slice(0, 2) })).toThrow(/exact receipt needs 3/);
  });
});

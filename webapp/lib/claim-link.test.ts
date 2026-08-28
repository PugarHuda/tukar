import { describe, it, expect } from "vitest";
import { encodeClaimPayload, openClaimPayload, isPinWrapped, buildClaimLink, claimPayloadFromHash, isValidPin } from "./claim-link";

// A realistic tukar1: note (same encoding as lib/zk.encodeBearerNote). The secrets are synthetic.
const fe = (seed: number) => String(seed).padEnd(77, "3141592653589793238462643383279502884197169399375105820974944592307816406286");
const note =
  "tukar1:" +
  Buffer.from(JSON.stringify({ v: 1, ref: "PAY-001", amount: "125000000", privKey: fe(1), pubKey: fe(2), blinding: fe(3), commitment: fe(4), corridor: "PH" })).toString("base64");

describe("claim link", () => {
  it("round-trips a plain note", async () => {
    const p = await encodeClaimPayload(note);
    expect(p.startsWith("v1.")).toBe(true);
    expect(isPinWrapped(p)).toBe(false);
    expect(await openClaimPayload(p)).toBe(note);
  });

  it("round-trips a PIN-wrapped note and rejects a wrong PIN", async () => {
    const p = await encodeClaimPayload(note, "123456");
    expect(isPinWrapped(p)).toBe(true);
    expect(p).not.toContain(Buffer.from(note).toString("base64url").slice(0, 24)); // the note is not in the clear
    expect(await openClaimPayload(p, "123456")).toBe(note);
    await expect(openClaimPayload(p, "654321")).rejects.toThrow(/Wrong PIN/);
    await expect(openClaimPayload(p)).rejects.toThrow(/PIN required/);
    await expect(openClaimPayload(p, "12")).rejects.toThrow(/6 digits/);
  });

  it("uses a fresh salt + iv per wrap", async () => {
    const a = await encodeClaimPayload(note, "000000");
    const b = await encodeClaimPayload(note, "000000");
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("validates PIN and note inputs", async () => {
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("12345a")).toBe(false);
    await expect(encodeClaimPayload(note, "abc")).rejects.toThrow(/6 digits/);
    await expect(encodeClaimPayload("hello")).rejects.toThrow(/tukar1/);
  });

  it("rejects malformed payloads", async () => {
    expect(() => isPinWrapped("v2.abc")).toThrow(/malformed/);
    expect(() => isPinWrapped("v1.a.b")).toThrow(/malformed/);
    expect(() => isPinWrapped("v1.")).toThrow(/malformed/);
    await expect(openClaimPayload("v1." + Buffer.from("not a note").toString("base64url"))).rejects.toThrow(/malformed/);
    await expect(openClaimPayload("v1.aGk.aGk.aGk", "123456")).rejects.toThrow(/Wrong PIN/);
  });

  it("builds a /receiver#claim= link and reads it back", async () => {
    const link = await buildClaimLink(note, undefined, "https://tukar-six.vercel.app");
    expect(link.startsWith("https://tukar-six.vercel.app/receiver#claim=v1.")).toBe(true);
    expect(await openClaimPayload(claimPayloadFromHash(link)!)).toBe(note);
    expect(claimPayloadFromHash("#x=1")).toBeNull();
    const pathOnly = await buildClaimLink(note, "123456", "");
    expect(pathOnly.startsWith("/receiver#claim=v1.")).toBe(true);
  });
});

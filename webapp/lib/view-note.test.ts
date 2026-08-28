import { describe, it, expect } from "vitest";
import { encodeViewNote, decodeViewNote, recomputeCommitment, viewNoteFromNote, VIEW_NOTE_PREFIX } from "./view-note";
import { newNote, encodeBearerNote } from "./zk";

const vn = {
  v: 1 as const,
  commitment: "2355239740659773331132358279365834472981544715890682147914231224966481732791",
  amount: "5000000000",
  pubKey: "12345678901234567890",
  blinding: "98765432109876543210",
  corridor: "ID",
  depositTx: "ab".repeat(32),
};

describe("view-only note codec", () => {
  it("round-trips through a tukview1: base64url string", () => {
    const s = encodeViewNote(vn);
    expect(s.startsWith(VIEW_NOTE_PREFIX)).toBe(true);
    expect(s).toMatch(/^tukview1:[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(decodeViewNote(s)).toEqual(vn);
    expect(decodeViewNote("  " + s + "\n")).toEqual(vn);
  });

  it("never carries a privKey, even when handed a full note", () => {
    const secret = "777777777777777777";
    const s = encodeViewNote({ ...vn, privKey: secret } as any);
    expect(s).not.toContain("privKey");
    expect(atob(s.slice(VIEW_NOTE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/"))).not.toContain(secret);
    const spendable = { ...vn, privKey: secret }; // a full sender note, privKey included
    const fromNote = viewNoteFromNote(spendable);
    expect("privKey" in fromNote).toBe(false);
    expect(fromNote).toEqual(vn);
  });

  it("rejects a bearer note and a payload smuggling a privKey", () => {
    const bearer = encodeBearerNote({ ...vn, privKey: "42" });
    expect(() => decodeViewNote(bearer)).toThrow(/spendable bearer note/);
    const smuggled = VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, privKey: "42" }));
    expect(() => decodeViewNote(smuggled)).toThrow(/private key/);
  });

  it("rejects malformed input", () => {
    expect(() => decodeViewNote("")).toThrow(/not a Tukar view-only note/);
    expect(() => decodeViewNote("tukview1:!!!")).toThrow(/malformed/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa("[1]"))).toThrow(/malformed/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, v: 2 })))).toThrow(/version/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, amount: "1.5" })))).toThrow(/amount/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, blinding: undefined })))).toThrow(/blinding/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, corridor: "Indonesia" })))).toThrow(/corridor/);
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, depositTx: "abc" })))).toThrow(/depositTx/);
    // non-canonical field element (>= r): the pool rejects these, so the codec does too
    const overR = "21888242871839275222246405745257275088548364400416034343698204186575808495617";
    expect(() => decodeViewNote(VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, commitment: overR })))).toThrow(/commitment/);
  });

  it("drops unknown keys on decode", () => {
    const s = VIEW_NOTE_PREFIX + btoa(JSON.stringify({ ...vn, extra: "x" }));
    expect(decodeViewNote(s)).toEqual(vn);
  });
});

describe("recomputeCommitment", () => {
  it("matches a known Poseidon(amount, pubKey, blinding) vector", async () => {
    // Vector produced by circomlibjs buildPoseidon (the hash newNote() commits with; the pool's
    // on-chain poseidon_hash is circomlib-exact, README "On-chain Poseidon").
    expect(await recomputeCommitment(vn)).toBe(vn.commitment);
    expect(await recomputeCommitment({ amount: "1", pubKey: "2", blinding: "3" })).toBe(
      "6542985608222806190361240322586112750744169038454362455181422643027100751666",
    );
  }, 30_000); // first call builds the circomlibjs Poseidon (WASM), slow under a parallel suite

  it("reproduces the commitment of a note built by the existing newNote() path", async () => {
    const note = await newNote(1_500_000_000n);
    const view = viewNoteFromNote({ ...note, corridor: "PH" });
    expect(await recomputeCommitment(decodeViewNote(encodeViewNote(view)))).toBe(note.commitment);
    // a tampered opening does not reproduce it
    expect(await recomputeCommitment({ ...view, amount: "1500000001" })).not.toBe(note.commitment);
  }, 30_000);
});

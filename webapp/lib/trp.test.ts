import { describe, it, expect } from "vitest";
import {
  encodeTravelAddress,
  decodeTravelAddress,
  canonicalize,
  DEMO_TRAVEL_ADDRESS,
  DEMO_TA_TOKEN,
} from "./trp";

describe("Travel Address encode/decode", () => {
  it("round-trips a beneficiary endpoint URL and parses its parts", () => {
    const url = "beneficiary.com/x/12345?t=i";
    const ta = encodeTravelAddress(url);
    const dec = decodeTravelAddress(ta);
    expect(dec.url).toBe(url);
    expect(dec.path).toBe("/x/12345");
    expect(dec.query).toBe("t=i");
    expect(dec.token).toBe("i");
  });

  it("strips an http(s) scheme before splitting the path", () => {
    const dec = decodeTravelAddress(encodeTravelAddress("https://vasp.example/inbound?t=abc"));
    expect(dec.path).toBe("/inbound");
    expect(dec.token).toBe("abc");
  });

  it("defaults path to '/' and token to '' when absent", () => {
    const dec = decodeTravelAddress(encodeTravelAddress("vasp.example"));
    expect(dec.path).toBe("/");
    expect(dec.token).toBe("");
  });

  it("preserves leading-zero bytes as leading '1' chars (base58 invariant)", () => {
    // Two leading NUL bytes (0x00) must survive as exactly two leading '1' chars.
    const withNuls = String.fromCharCode(0, 0) + "x";
    const ta = encodeTravelAddress(withNuls);
    expect(ta.startsWith("11")).toBe(true);
    expect(ta.startsWith("111")).toBe(false); // exactly two, not three
    expect(decodeTravelAddress(ta).url).toBe(withNuls);
  });

  it("round-trips the built-in demo Travel Address", () => {
    expect(decodeTravelAddress(DEMO_TRAVEL_ADDRESS).token).toBe(DEMO_TA_TOKEN);
  });

  it("rejects an invalid base58 character", () => {
    // '0', 'O', 'I', 'l' are not in the Bitcoin alphabet.
    expect(() => decodeTravelAddress("invalid0char")).toThrow(/invalid base58 char/);
  });
});

describe("canonicalize", () => {
  it("produces sorted-key output independent of insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("sorts keys recursively but preserves array order", () => {
    const a = { z: [3, 1, 2], nested: { y: 1, x: 2 } };
    const b = { nested: { x: 2, y: 1 }, z: [3, 1, 2] };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(canonicalize(a)).toBe('{"nested":{"x":2,"y":1},"z":[3,1,2]}');
  });

  it("handles primitives and null", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hi")).toBe('"hi"');
    expect(canonicalize(true)).toBe("true");
  });
});

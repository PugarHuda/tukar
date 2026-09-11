import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

// The Upstash client is the network boundary for the lifecycle store: mocked so the configured
// path can be exercised for real without a live Redis. The in-memory tests below run before any
// env is set, so they never touch it.
const fakeRedis = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { get = fakeRedis.get; set = fakeRedis.set; } }));
import {
  encodeTravelAddress,
  decodeTravelAddress,
  canonicalize,
  buildInquiry,
  signCanonical,
  verifyCanonical,
  verifyTrpRequest,
  trpHeaders,
  getTrpLifecycle,
  putTrpLifecycle,
  DEMO_TRAVEL_ADDRESS,
  DEMO_TA_TOKEN,
  TRP_API_VERSION,
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

// Signed-JSON: the outbound signer (send route) and the inbound verifier (inquiry + callback
// routes) must agree on the canonical bytes. The signing key is whatever the process loaded
// (ephemeral here: TRP_SIGNING_KEY is unset under vitest), which is exactly the deploy default.
describe("TRP Signed-JSON sign/verify", () => {
  const inquiry = buildInquiry({
    ivms101: { originator: { x: 1 }, beneficiary: { y: 1 }, transaction: { amount: "1", transactionReference: "R" } },
    amount: "1",
    callback: "https://tukar.local/api/travel-rule/callback",
  });

  it("verifies a signature over the canonical body and rejects tampering", async () => {
    const sig = await signCanonical(canonicalize(inquiry));
    expect(sig.alg).toBe("Ed25519");
    expect(await verifyCanonical(canonicalize(inquiry), sig.publicKey, sig.signature)).toBe(true);
    // Same object, different key order: still the same canonical bytes.
    const reordered = { callback: inquiry.callback, amount: inquiry.amount, asset: inquiry.asset, IVMS101: inquiry.IVMS101 };
    expect(await verifyCanonical(canonicalize(reordered), sig.publicKey, sig.signature)).toBe(true);
    expect(await verifyCanonical(canonicalize({ ...inquiry, amount: "2" }), sig.publicKey, sig.signature)).toBe(false);
    expect(await verifyCanonical(canonicalize(inquiry), sig.publicKey, "AAAA")).toBe(false);
    expect(await verifyCanonical(canonicalize(inquiry), "not-a-key", sig.signature)).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const sig = await signCanonical(canonicalize(inquiry));
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
    expect(await verifyCanonical(canonicalize(inquiry), other, sig.signature)).toBe(false);
  });

  const signed = async (body: unknown, extra: Record<string, string> = {}, requestIdentifier = crypto.randomUUID()) => {
    const sig = await signCanonical(canonicalize(body));
    return new Request("https://tukar.local/api/travel-rule", {
      method: "POST",
      headers: {
        ...trpHeaders({ requestIdentifier, apiExtensions: "signed-json" }),
        "x-trp-public-key": sig.publicKey,
        "x-trp-signature": sig.signature,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  };

  describe("verifyTrpRequest gate", () => {
    const pinned = process.env.TRP_PEER_PUBLIC_KEY;
    beforeEach(() => {
      delete process.env.TRP_PEER_PUBLIC_KEY;
    });
    afterEach(() => {
      if (pinned) process.env.TRP_PEER_PUBLIC_KEY = pinned;
    });

    it("passes a request the send route would produce, with the parsed body", async () => {
      const id = crypto.randomUUID();
      const req = await signed(inquiry, {}, id);
      const gate = await verifyTrpRequest(req, await req.json());
      expect(gate).toMatchObject({ ok: true, requestIdentifier: id });
    });

    it("rejects wrong api-version (400), missing identifier (400), missing or bad signature (401)", async () => {
      expect(await verifyTrpRequest(await signed(inquiry, { "api-version": "2.0.0" }), inquiry)).toMatchObject({ ok: false, status: 400 });
      const noId = await signed(inquiry);
      const h = new Headers(noId.headers);
      h.delete("request-identifier");
      expect(await verifyTrpRequest(new Request(noId.url, { method: "POST", headers: h }), inquiry)).toMatchObject({ ok: false, status: 400 });
      expect(await verifyTrpRequest(await signed(inquiry, { "x-trp-signature": "" }), inquiry)).toMatchObject({ ok: false, status: 401 });
      // Body altered in flight: signature no longer matches the canonical form.
      expect(await verifyTrpRequest(await signed(inquiry), { ...inquiry, amount: "999" })).toMatchObject({ ok: false, status: 401 });
      expect(TRP_API_VERSION).toBe("3.2.1");
    });

    it("pins the peer key when TRP_PEER_PUBLIC_KEY is set", async () => {
      const sig = await signCanonical(canonicalize(inquiry));
      process.env.TRP_PEER_PUBLIC_KEY = sig.publicKey;
      expect(await verifyTrpRequest(await signed(inquiry), inquiry)).toMatchObject({ ok: true });
      process.env.TRP_PEER_PUBLIC_KEY = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
      expect(await verifyTrpRequest(await signed(inquiry), inquiry)).toMatchObject({ ok: false, status: 401, rejected: "Unknown TRP peer key." });
    });
  });
});

// Lifecycle store: without Upstash env (the vitest default) it is the in-memory Map.
describe("TRP lifecycle store (in-memory fallback)", () => {
  it("round-trips a record and reports unknown ids as null", async () => {
    const id = crypto.randomUUID();
    expect(await getTrpLifecycle(id)).toBeNull();
    const now = new Date().toISOString();
    await putTrpLifecycle({
      requestIdentifier: id,
      status: "approved",
      asset: { network: "Stellar", code: "USDC" },
      amount: "1",
      transactionReference: "R",
      originatorCallback: "",
      peerPublicKey: "k",
      address: "G",
      createdAt: now,
      updatedAt: now,
    });
    expect(await getTrpLifecycle(id)).toMatchObject({ status: "approved", address: "G" });
    await putTrpLifecycle({ ...(await getTrpLifecycle(id))!, status: "confirmed", txid: "tx" });
    expect(await getTrpLifecycle(id)).toMatchObject({ status: "confirmed", txid: "tx" });
  });

  // The Redis path stores with `ex: 7 days` and refreshes it on every write. The fallback has to
  // expire the same way, or a warm instance keeps identifiers forever while the real store forgets
  // them, and the two backends disagree about which replays are still blocked.
  const record = (id: string, updatedAt: string) => ({
    requestIdentifier: id,
    status: "approved" as const,
    asset: { network: "Stellar", code: "USDC" },
    amount: "1",
    transactionReference: "R",
    originatorCallback: "",
    peerPublicKey: "k",
    address: "G",
    createdAt: updatedAt,
    updatedAt,
  });
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

  it("expires a record older than the Redis TTL", async () => {
    const id = crypto.randomUUID();
    await putTrpLifecycle(record(id, daysAgo(8)));
    expect(await getTrpLifecycle(id)).toBeNull();
  });

  it("keeps a record inside the TTL, measured from its last write", async () => {
    const id = crypto.randomUUID();
    await putTrpLifecycle(record(id, daysAgo(6)));
    expect(await getTrpLifecycle(id)).toMatchObject({ status: "approved" });
    // A stale record rewritten now is live again, exactly as `set ... ex` would make it.
    await putTrpLifecycle({ ...record(id, daysAgo(8)), updatedAt: new Date().toISOString() });
    expect(await getTrpLifecycle(id)).toMatchObject({ status: "approved" });
  });

  it("treats an unparseable timestamp as expired rather than immortal", async () => {
    const id = crypto.randomUUID();
    await putTrpLifecycle(record(id, "not a date"));
    expect(await getTrpLifecycle(id)).toBeNull();
  });
});

// Configured path: with the Upstash env present every read and write goes to Redis, so the replay
// guard the TRP routes depend on is shared across instances instead of per instance.
describe("TRP lifecycle store (Upstash configured)", () => {
  const OLD = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "token";
    fakeRedis.get.mockReset();
    fakeRedis.set.mockReset();
  });
  afterEach(() => {
    if (OLD.url === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = OLD.url;
    if (OLD.token === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = OLD.token;
  });

  it("writes under trp:<id> with the 7 day expiry and reads back through Redis", async () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const rec = {
      requestIdentifier: id,
      status: "approved" as const,
      asset: null,
      amount: "1",
      transactionReference: "R",
      originatorCallback: "",
      peerPublicKey: "k",
      address: "G",
      createdAt: now,
      updatedAt: now,
    };
    await putTrpLifecycle(rec);
    expect(fakeRedis.set).toHaveBeenCalledWith(`trp:${id}`, rec, { ex: 7 * 24 * 3600 });

    fakeRedis.get.mockResolvedValueOnce(rec);
    expect(await getTrpLifecycle(id)).toMatchObject({ status: "approved" });
    expect(fakeRedis.get).toHaveBeenCalledWith(`trp:${id}`);
  });

  it("reports an id Redis does not hold as null without consulting the in-memory fallback", async () => {
    const id = crypto.randomUUID();
    fakeRedis.get.mockResolvedValueOnce(null);
    expect(await getTrpLifecycle(id)).toBeNull();
  });
});

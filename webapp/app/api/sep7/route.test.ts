import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { GET, POST } from "./route";
import { parsePayUri, verifyPayUri } from "@/lib/sep7";

// The domain signature says "tukar-six.vercel.app vouches for this payment request". These tests
// pin the only thing that makes that true: the payee asked for it. An attacker who can POST must
// never walk away with a domain-signed URI pointing at an address they did not prove they hold.
// Ephemeral keypairs, generated per run — no real secret is involved anywhere here.
const domainKp = Keypair.random(); // stands in for the published URI_REQUEST_SIGNING_KEY
const payee = Keypair.random();
const attacker = Keypair.random();

const SEP53_PREFIX = "Stellar Signed Message:\n";
const sep53 = (kp: Keypair, message: string): string =>
  Buffer.from(kp.sign(createHash("sha256").update(Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), Buffer.from(message, "utf8")])).digest())).toString("base64");

// A fresh client IP per call so the route's own rate limiter never colours a result.
let n = 0;
const ip = () => `203.0.113.${(n++ % 250) + 1}`;

const post = async (body: unknown): Promise<any> => {
  const res = await POST(new Request("https://tukar-six.vercel.app/api/sep7", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(body) }));
  return res.json();
};
const get = async (address?: string): Promise<any> => {
  const url = address ? `https://tukar-six.vercel.app/api/sep7?address=${address}` : "https://tukar-six.vercel.app/api/sep7";
  return (await GET(new Request(url, { headers: { "x-forwarded-for": ip() } }))).json();
};
/** What an honest payee's browser does: take the challenge for its own account and sign it. */
const proofFor = async (kp: Keypair) => {
  const { nonce } = await get(kp.publicKey());
  return { nonce, signature: sep53(kp, nonce) };
};

const OLD = { auth: process.env.AUTH_SECRET, sep7: process.env.SEP7_SIGNING_SECRET };
beforeAll(() => {
  process.env.AUTH_SECRET = "vitest-auth-secret-0123456789";
  process.env.SEP7_SIGNING_SECRET = domainKp.secret(); // throwaway test key
});
afterAll(() => {
  OLD.auth === undefined ? delete process.env.AUTH_SECRET : (process.env.AUTH_SECRET = OLD.auth);
  OLD.sep7 === undefined ? delete process.env.SEP7_SIGNING_SECRET : (process.env.SEP7_SIGNING_SECRET = OLD.sep7);
});

describe("POST /api/sep7 only vouches for a request its payee signed", () => {
  it("refuses a signature for an attacker-chosen destination", async () => {
    const j = await post({ destination: attacker.publicKey(), amount: "100", msg: "invoice" });
    expect(j).toMatchObject({ ok: true, signed: false });
    expect(j.uri).not.toContain("signature=");
    expect(j.uri).not.toContain("origin_domain="); // SEP-7 forbids origin_domain without a signature
    expect(verifyPayUri(j.uri, domainKp.publicKey())).toBe(false);
  });

  it("refuses when the proof is for a different account than the destination", async () => {
    // The attacker holds their own account and can answer any challenge for it — but they want a
    // signature over someone else's (or a lookalike) destination. That must not be signable.
    const j = await post({ destination: payee.publicKey(), amount: "100", ...(await proofFor(attacker)) });
    expect(j).toMatchObject({ ok: true, signed: false });
    expect(j.uri).not.toContain("signature=");
  });

  it("refuses a forged or empty signature over a real challenge", async () => {
    const { nonce } = await get(attacker.publicKey());
    expect(await post({ destination: attacker.publicKey(), amount: "1", nonce, signature: sep53(payee, nonce) })).toMatchObject({ signed: false });
    expect(await post({ destination: attacker.publicKey(), amount: "1", nonce, signature: "" })).toMatchObject({ signed: false });
  });

  it("signs for a payee that answered the challenge for its own account", async () => {
    const j = await post({ destination: payee.publicKey(), amount: "25.5", msg: "rent", ...(await proofFor(payee)) });
    expect(j).toMatchObject({ ok: true, signed: true, originDomain: "tukar-six.vercel.app" });
    expect(verifyPayUri(j.uri, domainKp.publicKey())).toBe(true);
    expect(parsePayUri(j.uri)).toMatchObject({ destination: payee.publicKey(), amount: "25.5", msg: "rent", originDomain: "tukar-six.vercel.app" });
  });

  it("spends the challenge, so a captured proof cannot be replayed for another request", async () => {
    const proof = await proofFor(payee);
    expect(await post({ destination: payee.publicKey(), amount: "1", ...proof })).toMatchObject({ signed: true });
    expect(await post({ destination: payee.publicKey(), amount: "9999", ...proof })).toMatchObject({ signed: false });
  });

  it("still answers honestly unsigned when no signing secret is configured", async () => {
    const proof = await proofFor(payee);
    delete process.env.SEP7_SIGNING_SECRET;
    try {
      const j = await post({ destination: payee.publicKey(), amount: "10", ...proof });
      expect(j).toMatchObject({ ok: true, signed: false });
      expect(j.note).toContain("SEP7_SIGNING_SECRET");
      expect(parsePayUri(j.uri)).toMatchObject({ destination: payee.publicKey(), amount: "10" });
      expect(await get(payee.publicKey())).toEqual({ signing: false }); // no challenge to hand out
    } finally {
      process.env.SEP7_SIGNING_SECRET = domainKp.secret();
    }
  });

  it("still validates the request itself", async () => {
    expect(await post({ destination: "GABC", amount: "1" })).toMatchObject({ ok: false });
    expect(await post({ destination: payee.publicKey(), amount: "1.12345678" })).toMatchObject({ ok: false });
  });
});

describe("GET /api/sep7 challenge", () => {
  it("issues a nonce only for a valid Stellar address", async () => {
    expect(await get()).toEqual({ signing: true });
    expect(await get("not-an-address")).toEqual({ signing: true });
    expect((await get(payee.publicKey())).nonce).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

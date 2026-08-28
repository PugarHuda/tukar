import "server-only";
// Wallet sign-in for the scheduler API (server-only). A caller proves control of its Stellar
// G-address by signing a short-lived, server-issued nonce with SEP-53 message signing; the server
// verifies that signature with the raw ed25519 key and returns a bearer token that scopes every
// schedule read/write to that address. No corridor/admin key is involved and no secret is stored.
//
// ENV: AUTH_SECRET (server-only, NEVER NEXT_PUBLIC) — an HMAC key of >= 16 chars. It signs the
// nonce and the session token. Without it the scheduler degrades to the device-local reminder.
//
// SCHEME (stateless, no session store):
//   nonce  = base64url(JSON{a,r,exp}) "." HMAC("nonce", payload)     TTL 5 min
//   token  = base64url(JSON{a,exp})   "." HMAC("token", payload)     TTL 12 h
// SEP-53 payload signed by the wallet = SHA256("Stellar Signed Message:\n" + nonce).
// See scripts/auth-selfcheck.mjs for the runnable check of these properties.
import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { Redis } from "@upstash/redis";

const G_RE = /^G[A-Z2-7]{55}$/; // Stellar ed25519 public key (G-address)
const NONCE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const SEP53_PREFIX = "Stellar Signed Message:\n";

/** True iff a usable AUTH_SECRET is set. The scheduler routes gate on this + Blob being wired. */
export function isAuthConfigured(): boolean {
  const s = process.env.AUTH_SECRET;
  return !!s && s.length >= 16;
}
function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is not set (need >= 16 chars)");
  return s;
}

const b64u = (b: Buffer) => b.toString("base64url");
function mac(domain: string, payloadB64: string): string {
  // Domain separation ("nonce" vs "token") so a nonce can never be replayed as a session token.
  return createHmac("sha256", secret()).update(domain + "\n" + payloadB64).digest("base64url");
}
function eq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
function seal(domain: string, obj: Record<string, unknown>): string {
  const p = b64u(Buffer.from(JSON.stringify(obj)));
  return p + "." + mac(domain, p);
}
function open(domain: string, token: string): any | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const p = token.slice(0, dot), sig = token.slice(dot + 1);
  if (!eq(sig, mac(domain, p))) return null; // tampered payload or wrong secret
  try {
    return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/** Issue a signed challenge nonce bound to `address`. The client signs the whole string. */
export function issueNonce(address: string): string {
  if (!G_RE.test(address)) throw new Error("invalid Stellar address");
  return seal("nonce", { a: address, r: randomBytes(12).toString("hex"), exp: Date.now() + NONCE_TTL_MS });
}

/** SEP-53: verify `signatureB64` is `address`'s signature over SHA256(prefix + message). */
export function verifyWalletSignature(address: string, message: string, signatureB64: string): boolean {
  try {
    if (!G_RE.test(address)) return false;
    const hash = createHash("sha256")
      .update(Buffer.concat([Buffer.from(SEP53_PREFIX, "utf8"), Buffer.from(message, "utf8")]))
      .digest();
    return Keypair.fromPublicKey(address).verify(hash, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

// Single-use nonces. Issuance stays stateless; a nonce is marked spent on its first successful
// exchange (SET NX with the nonce's remaining TTL, so the marker expires with the nonce) and a
// second exchange of the same nonce is refused. Upstash when the same env as lib/ratelimit.ts is
// present; otherwise a per-instance Map, which is honest about its ceiling: a replay against a
// different warm instance is not caught without KV.
const spentNonces = new Map<string, number>();
let _redis: Redis | null = null;
function redis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}
async function spendNonce(r: string, exp: number): Promise<boolean> {
  const ttl = Math.max(1, exp - Date.now());
  const client = redis();
  if (client) return (await client.set(`nonce:${r}`, 1, { nx: true, px: ttl })) === "OK";
  const now = Date.now();
  for (const [k, e] of spentNonces) if (e < now) spentNonces.delete(k);
  if (spentNonces.has(r)) return false;
  spentNonces.set(r, exp);
  return true;
}

/** Exchange a signed nonce for a session token. Returns null on any failure (fail closed). */
export async function issueToken(address: string, nonce: string, signatureB64: string): Promise<string | null> {
  const n = open("nonce", nonce);
  if (!n || n.a !== address || typeof n.exp !== "number" || n.exp < Date.now() || typeof n.r !== "string") return null;
  if (!verifyWalletSignature(address, nonce, signatureB64)) return null;
  if (!(await spendNonce(n.r, n.exp))) return null; // replayed nonce
  return seal("token", { a: address, exp: Date.now() + TOKEN_TTL_MS });
}

/** Verify a session token; returns the owner address or null. */
export function verifyToken(token: string): string | null {
  const t = open("token", token);
  if (!t || typeof t.a !== "string" || !G_RE.test(t.a) || typeof t.exp !== "number" || t.exp < Date.now()) return null;
  return t.a;
}

/** Derive the authenticated owner from an `Authorization: Bearer <token>` header, or null. */
export function authOwner(req: Request): string | null {
  if (!isAuthConfigured()) return null;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? verifyToken(m[1].trim()) : null;
}

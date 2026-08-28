// TRP (Travel Rule Protocol) 3.2.1 primitives, OpenVASP flavour.
//
// This is the REAL wire protocol, not a mock: an HTTPS POST of an IVMS101 transfer inquiry
// with the three TRP headers (api-version / request-identifier / api-extensions), a beneficiary
// endpoint decoded from a base58 Travel Address, and a detached TRP Signed-JSON signature over
// the canonical body. What is out of scope for a serverless deploy is mTLS and a live TRISA/BVN
// directory (both need long-lived certs + a peer registry a stateless function cannot hold), so
// both ends here can be the same operator — one real TRP node talking to itself.
//
// Isomorphic by design: everything here runs in the browser (regulator tab) EXCEPT signCanonical,
// which lazy-imports node:crypto and must only be called server-side.

import { log } from "./log";

export const TRP_API_VERSION = "3.2.1";

// ---- base58 (Bitcoin alphabet) ----------------------------------------------------------------
// Travel Addresses are base58 of a plain URL string per TRP, e.g. base58("beneficiary.com/x/12345?t=i").
// ponytail: hand-rolled ~20 lines instead of adding a bs58 dependency for one call site.
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}

function base58decode(str: string): Uint8Array {
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < str.length; i++) {
    const val = B58.indexOf(str[i]);
    if (val < 0) throw new Error(`invalid base58 char '${str[i]}'`);
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

// ---- Travel Address ---------------------------------------------------------------------------
// A Travel Address encodes the beneficiary VASP's TRP endpoint so the originator knows where to POST.
export function encodeTravelAddress(endpointUrl: string): string {
  return base58encode(new TextEncoder().encode(endpointUrl));
}

export function decodeTravelAddress(travelAddress: string): {
  url: string;
  path: string;
  query: string;
  token: string;
} {
  const url = new TextDecoder().decode(base58decode(travelAddress));
  // Strip any scheme, then split path/query. Travel Addresses omit the scheme by convention.
  const bare = url.replace(/^https?:\/\//, "");
  const slash = bare.indexOf("/");
  const pathPart = slash < 0 ? "/" : bare.slice(slash);
  const [path, query = ""] = pathPart.split("?");
  const token = new URLSearchParams(query).get("t") || "";
  return { url, path, query, token };
}

// The self-hosted peer. Its Travel Address decodes to our own inbound TRP endpoint; the `t` token
// is the address id the beneficiary endpoint checks (a wrong/expired one yields a real TRP 404).
export const DEMO_TA_TOKEN = "demo";
export const DEMO_TRAVEL_ADDRESS = encodeTravelAddress(`tukar.local/api/travel-rule?t=${DEMO_TA_TOKEN}`);

// ---- TRP headers ------------------------------------------------------------------------------
export function trpHeaders(opts?: { requestIdentifier?: string; apiExtensions?: string }): Record<string, string> {
  return {
    "content-type": "application/json",
    "api-version": TRP_API_VERSION,
    "request-identifier": opts?.requestIdentifier ?? crypto.randomUUID(),
    ...(opts?.apiExtensions ? { "api-extensions": opts.apiExtensions } : {}),
  };
}

// ---- IVMS101 transfer inquiry -----------------------------------------------------------------
// Builds a TRP transfer inquiry from the IVMS101-shaped payload the regulator tab already derives
// from a verified disclosure. The IVMS101 identity fields stay exactly as passed (PII placeholders).
export function buildInquiry(opts: {
  ivms101: unknown;
  amount: string;
  callback: string;
  asset?: { network: string; code: string };
}) {
  return {
    IVMS101: opts.ivms101,
    asset: opts.asset ?? { network: "Stellar", code: "USDC" },
    amount: opts.amount,
    callback: opts.callback,
  };
}

// ---- canonical JSON + TRP Signed-JSON signature -----------------------------------------------
// Deterministic serialisation (recursively sorted keys) so both ends sign/verify identical bytes.
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalize).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(o[k])).join(",") + "}";
}

// Detached Ed25519 signature over the canonical body, via Web Crypto (isomorphic, no node import so
// the client bundle stays clean; called server-side only). The signing key is this VASP's identity:
// loaded from TRP_SIGNING_KEY (PKCS8 DER, base64) so it is stable across cold starts; when that env
// is absent an ephemeral keypair is generated once per process (warned once). We ship the public
// key (SPKI) so the counterparty can verify; on this single-operator deploy that peer is us. In a
// multi-VASP network the public key comes from the TRISA/BVN directory instead.
//
// Generate a stable key (prints TRP_SIGNING_KEY then the SPKI public key for TRP_PEER_PUBLIC_KEY):
//   node -e "const c=require('crypto');const k=c.generateKeyPairSync('ed25519');console.log(k.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'));console.log(k.publicKey.export({type:'spki',format:'der'}).toString('base64'))"
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const ED25519 = { name: "Ed25519" };

let _keyPair: Promise<CryptoKeyPair> | null = null;

async function loadKeyPair(): Promise<CryptoKeyPair> {
  const subtle = globalThis.crypto.subtle;
  const pkcs8 = process.env.TRP_SIGNING_KEY;
  if (!pkcs8) {
    log.warn("TRP_SIGNING_KEY unset; using an ephemeral TRP signing key for this process");
    return (await subtle.generateKey(ED25519, false, ["sign", "verify"])) as CryptoKeyPair;
  }
  // Web Crypto cannot derive the public key from a private key directly: export the private JWK,
  // keep only its public part (x), and re-import that as the verify key.
  const priv = await subtle.importKey("pkcs8", unb64(pkcs8), ED25519, true, ["sign"]);
  const { x } = await subtle.exportKey("jwk", priv);
  const publicKey = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, ED25519, true, ["verify"]);
  const privateKey = await subtle.importKey("pkcs8", unb64(pkcs8), ED25519, false, ["sign"]);
  return { privateKey, publicKey };
}

export async function signCanonical(canonical: string): Promise<{
  alg: string;
  publicKey: string;
  signature: string;
  digest: string;
}> {
  const subtle = globalThis.crypto.subtle;
  if (!_keyPair) _keyPair = loadKeyPair();
  const kp = await _keyPair;
  const data = new TextEncoder().encode(canonical);
  const [signature, spki, digest] = await Promise.all([
    subtle.sign(ED25519, kp.privateKey, data),
    subtle.exportKey("spki", kp.publicKey),
    subtle.digest("SHA-256", data),
  ]);
  return { alg: "Ed25519", publicKey: b64(spki), signature: b64(signature), digest: hex(digest) };
}

// Verify a detached TRP Signed-JSON signature: the peer's SPKI public key (x-trp-public-key) over
// the same canonical bytes signCanonical produced. Any malformed key/signature verifies false.
export async function verifyCanonical(canonical: string, publicKeySpki: string, signature: string): Promise<boolean> {
  try {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.importKey("spki", unb64(publicKeySpki), ED25519, false, ["verify"]);
    return await subtle.verify(ED25519, key, unb64(signature), new TextEncoder().encode(canonical));
  } catch {
    return false;
  }
}

// Inbound TRP request gate shared by the inquiry and callback endpoints: api-version must match,
// request-identifier must be present, and the Signed-JSON signature must verify over the canonical
// form of the parsed body under the supplied SPKI key. When TRP_PEER_PUBLIC_KEY is set the supplied
// key must equal it (pinned peer); otherwise any well-formed key is accepted and recorded.
export type TrpGate =
  | { ok: true; requestIdentifier: string; publicKey: string }
  | { ok: false; status: number; rejected: string };

export async function verifyTrpRequest(req: Request, body: unknown): Promise<TrpGate> {
  if (req.headers.get("api-version") !== TRP_API_VERSION) {
    return { ok: false, status: 400, rejected: `Unsupported api-version. This node speaks TRP ${TRP_API_VERSION}.` };
  }
  const requestIdentifier = req.headers.get("request-identifier");
  if (!requestIdentifier) return { ok: false, status: 400, rejected: "Missing request-identifier header." };

  const publicKey = req.headers.get("x-trp-public-key") || "";
  const signature = req.headers.get("x-trp-signature") || "";
  if (!publicKey || !signature) return { ok: false, status: 401, rejected: "Missing TRP Signed-JSON signature." };
  const pinned = process.env.TRP_PEER_PUBLIC_KEY;
  if (pinned && publicKey !== pinned) return { ok: false, status: 401, rejected: "Unknown TRP peer key." };
  if (!(await verifyCanonical(canonicalize(body), publicKey, signature))) {
    return { ok: false, status: 401, rejected: "TRP signature verification failed." };
  }
  return { ok: true, requestIdentifier, publicKey };
}

// ---- TRP lifecycle store --------------------------------------------------------------------------
// One record per transfer inquiry under `trp:<request-identifier>`: approved/rejected on intake,
// then confirmed/canceled by the originator's callback. Upstash Redis when the same env as
// lib/ratelimit.ts is present (lazy-imported so the client bundle stays clean); otherwise a
// per-instance Map with a one-time warning. Never holds IVMS101 PII, only the transaction leaf.
export type TrpLifecycle = {
  requestIdentifier: string;
  status: "approved" | "rejected" | "confirmed" | "canceled";
  asset: unknown;
  amount: string;
  transactionReference: string;
  originatorCallback: string;
  peerPublicKey: string;
  address?: string;
  reason?: string;
  txid?: string;
  createdAt: string;
  updatedAt: string;
};

const TRP_TTL_SECONDS = 7 * 24 * 3600;
// ponytail: unbounded per-instance Map; fine for a preview without KV (entries die with the instance).
const memStore = new Map<string, TrpLifecycle>();
let warnedMem = false;
let _redis: Promise<import("@upstash/redis").Redis> | null = null;

function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warnedMem) {
      warnedMem = true;
      log.warn("Upstash env unset; TRP lifecycle store is in-memory (per instance)");
    }
    return null;
  }
  if (!_redis) _redis = import("@upstash/redis").then(({ Redis }) => new Redis({ url, token }));
  return _redis;
}

export async function getTrpLifecycle(requestIdentifier: string): Promise<TrpLifecycle | null> {
  const r = await redis();
  if (!r) return memStore.get(requestIdentifier) ?? null;
  return (await r.get<TrpLifecycle>(`trp:${requestIdentifier}`)) ?? null;
}

export async function putTrpLifecycle(rec: TrpLifecycle): Promise<void> {
  const r = await redis();
  if (!r) {
    memStore.set(rec.requestIdentifier, rec);
    return;
  }
  await r.set(`trp:${rec.requestIdentifier}`, rec, { ex: TRP_TTL_SECONDS });
}

// ---- self-check -------------------------------------------------------------------------------
// Run: `node lib/trp.ts` (Node 23+ strips types). Asserts the Travel Address round-trips.
//   Verified passing: "trp self-check OK — Travel Address round-trips: EJKtAQyrS5x6i59GBS2fcbcU…"
export function demo(): void {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("trp self-check FAILED: " + m);
  };
  const url = "beneficiary.com/x/12345?t=i";
  const ta = encodeTravelAddress(url);
  const dec = decodeTravelAddress(ta);
  assert(dec.url === url, `round-trip mismatch: ${dec.url} !== ${url}`);
  assert(dec.token === "i", `token parse: ${dec.token}`);
  assert(dec.path === "/x/12345", `path parse: ${dec.path}`);
  assert(decodeTravelAddress(DEMO_TRAVEL_ADDRESS).token === DEMO_TA_TOKEN, "demo TA token");
  // base58 of empty and leading-zero bytes
  assert(base58encode(new Uint8Array([0, 0, 1])) === "112", "leading-zero encode");
  console.log("trp self-check OK — Travel Address round-trips:", ta.slice(0, 24) + "…");
}

// Auto-run when executed directly (decode so spaces in the path still match; no node import so the
// client bundle stays clean).
if (typeof process !== "undefined" && process.argv?.[1]) {
  const self = decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
  if (self === process.argv[1].replace(/\\/g, "/")) demo();
}

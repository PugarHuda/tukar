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
// the client bundle stays clean; called server-side only). The keypair is generated once per
// process — a real, self-hosted TRP signing key. We ship the public key (SPKI) so the counterparty
// can verify; on this single-operator deploy that peer is us. In a multi-VASP network the public
// key comes from the TRISA/BVN directory instead.
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

let _keyPair: CryptoKeyPair | null = null;

export async function signCanonical(canonical: string): Promise<{
  alg: string;
  publicKey: string;
  signature: string;
  digest: string;
}> {
  const subtle = globalThis.crypto.subtle;
  if (!_keyPair) _keyPair = (await subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair;
  const data = new TextEncoder().encode(canonical);
  const [signature, spki, digest] = await Promise.all([
    subtle.sign({ name: "Ed25519" }, _keyPair.privateKey, data),
    subtle.exportKey("spki", _keyPair.publicKey),
    subtle.digest("SHA-256", data),
  ]);
  return { alg: "Ed25519", publicKey: b64(spki), signature: b64(signature), digest: hex(digest) };
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

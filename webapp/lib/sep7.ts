// SEP-7 `web+stellar:pay` payment-request URIs, own implementation of
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md (encode, sign,
// parse, verify) on the SDK's Keypair/StrKey primitives. No wallet-sdk dependency.
//
// What the URI means for Tukar: the pool deposit is a Soroban contract call, not a classic
// payment, so a generic wallet scanning this would pay USDC straight to the destination account
// (a real, valid SEP-7 request). The Tukar sender app reads the SAME URI as a request
// (amount, payee, message) and prefills its shielded send instead. Signed with the domain key
// published as URI_REQUEST_SIGNING_KEY in /.well-known/stellar.toml so a sender can verify who
// issued the request (SEP-7 "Request Signing").
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { USDC_ISSUER } from "./constants";
import { fetchWithTimeout } from "./net";

export const SEP7_ORIGIN_DOMAIN = "tukar-six.vercel.app";
const SCHEME = "web+stellar:pay?";
// Payload prefix per spec: 35 zero bytes, one 0x04 byte, then "stellar.sep.7 - URI Scheme" + URI.
const SIGN_PREFIX = "stellar.sep.7 - URI Scheme";

export type PayRequest = {
  destination: string;
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  memo?: string;
  memoType?: string;
  msg?: string;
  networkPassphrase?: string;
  originDomain?: string;
  signature?: string;
};

const PARAMS: [keyof PayRequest, string][] = [
  ["destination", "destination"],
  ["amount", "amount"],
  ["assetCode", "asset_code"],
  ["assetIssuer", "asset_issuer"],
  ["memo", "memo"],
  ["memoType", "memo_type"],
  ["msg", "msg"],
  ["networkPassphrase", "network_passphrase"],
  ["originDomain", "origin_domain"],
  ["signature", "signature"],
];

/** Build an unsigned (or, when `signature` is set, signed) pay URI with params in spec order. */
export function buildPayUri(p: PayRequest): string {
  if (!StrKey.isValidEd25519PublicKey(p.destination)) throw new Error("SEP-7: destination is not a G... public key");
  if (p.amount !== undefined && !/^\d+(\.\d{1,7})?$/.test(p.amount)) throw new Error("SEP-7: amount must be a decimal with at most 7 places");
  if (p.msg !== undefined && p.msg.length > 300) throw new Error("SEP-7: msg is longer than 300 characters");
  const parts: string[] = [];
  for (const [k, q] of PARAMS) {
    const v = p[k];
    if (v !== undefined && v !== "") parts.push(`${q}=${encodeURIComponent(v)}`);
  }
  return SCHEME + parts.join("&");
}

/** The exact bytes SEP-7 signs: 35 x 0x00, 0x04, then utf8(prefix + uri). */
export function sep7Payload(uri: string): Buffer {
  return Buffer.concat([Buffer.alloc(35, 0), Buffer.from([4]), Buffer.from(SIGN_PREFIX + uri, "utf8")]);
}

/** Strip a trailing `&signature=...` (spec: signature is always the last param). */
export function unsignedPart(uri: string): { unsigned: string; signature: string | null } {
  const i = uri.lastIndexOf("&signature=");
  if (i < 0) return { unsigned: uri, signature: null };
  return { unsigned: uri.slice(0, i), signature: decodeURIComponent(uri.slice(i + "&signature=".length)) };
}

/** Sign an unsigned URI (must carry origin_domain) with the domain's S... secret; returns the full URI. */
export function signPayUri(uri: string, secret: string): string {
  if (!/[?&]origin_domain=/.test(uri)) throw new Error("SEP-7: origin_domain is required to sign");
  if (unsignedPart(uri).signature !== null) throw new Error("SEP-7: URI is already signed");
  const sig = Keypair.fromSecret(secret).sign(sep7Payload(uri)).toString("base64");
  return `${uri}&signature=${encodeURIComponent(sig)}`;
}

/** Verify a signed URI against a G... URI_REQUEST_SIGNING_KEY. Malformed anything verifies false. */
export function verifyPayUri(uri: string, signingKey: string): boolean {
  try {
    const { unsigned, signature } = unsignedPart(uri);
    if (!signature) return false;
    return Keypair.fromPublicKey(signingKey).verify(sep7Payload(unsigned), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

/** Parse + validate a pay URI. Throws on anything that is not a well-formed SEP-7 pay request. */
export function parsePayUri(raw: string): PayRequest {
  const s = raw.trim();
  if (!s.startsWith(SCHEME)) throw new Error("not a web+stellar:pay URI");
  const q = new URLSearchParams(s.slice(SCHEME.length));
  const out: PayRequest = { destination: q.get("destination") ?? "" };
  for (const [k, name] of PARAMS) {
    const v = q.get(name);
    if (v !== null && k !== "destination") out[k] = v;
  }
  if (!StrKey.isValidEd25519PublicKey(out.destination)) throw new Error("SEP-7: destination is not a valid Stellar account");
  if (out.amount !== undefined && !/^\d+(\.\d{1,7})?$/.test(out.amount)) throw new Error("SEP-7: invalid amount");
  if (out.assetIssuer !== undefined && !StrKey.isValidEd25519PublicKey(out.assetIssuer)) throw new Error("SEP-7: invalid asset_issuer");
  if (out.originDomain !== undefined && !isFqdn(out.originDomain)) throw new Error("SEP-7: origin_domain is not a fully qualified domain name");
  return out;
}

export function isFqdn(d: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(d);
}

/** URI_REQUEST_SIGNING_KEY from https://<domain>/.well-known/stellar.toml, or null when absent. */
export async function fetchUriSigningKey(domain: string): Promise<string | null> {
  if (!isFqdn(domain)) return null;
  // Same-origin when the app IS the domain (prod), else the real cross-origin SEP-1 fetch.
  const self = typeof location !== "undefined" && location.host.toLowerCase() === domain.toLowerCase();
  const url = self ? "/.well-known/stellar.toml" : `https://${domain}/.well-known/stellar.toml`;
  const res = await fetchWithTimeout(url, { headers: { accept: "text/plain" } }, 10_000);
  if (!res.ok) return null;
  const m = (await res.text()).match(/^\s*URI_REQUEST_SIGNING_KEY\s*=\s*"(G[A-Z2-7]{55})"/m);
  return m && StrKey.isValidEd25519PublicKey(m[1]) ? m[1] : null;
}

export type Sep7Check =
  | { ok: true; request: PayRequest; verifiedDomain: string | null }
  | { ok: false; reason: string; request?: PayRequest };

/** Full SEP-7 wallet-side handling: parse, then (when origin_domain is present) require a
 *  signature and verify it against the domain's published key. No origin_domain = unsigned request. */
export async function checkPayUri(raw: string): Promise<Sep7Check> {
  let request: PayRequest;
  try {
    request = parsePayUri(raw);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (!request.originDomain) return { ok: true, request, verifiedDomain: null };
  if (!request.signature) return { ok: false, reason: "origin_domain is set but the request is not signed", request };
  let key: string | null;
  try {
    key = await fetchUriSigningKey(request.originDomain);
  } catch {
    return { ok: false, reason: `could not fetch stellar.toml from ${request.originDomain}`, request };
  }
  if (!key) return { ok: false, reason: `${request.originDomain} publishes no URI_REQUEST_SIGNING_KEY`, request };
  if (!verifyPayUri(raw.trim(), key)) return { ok: false, reason: `signature does not verify against ${request.originDomain}`, request };
  return { ok: true, request, verifiedDomain: request.originDomain };
}

/** The Tukar request as an unsigned pay URI (USDC, the request memo as `msg`, our origin_domain). */
export function tukarPayUri(destination: string, amount: string, msg: string, originDomain = SEP7_ORIGIN_DOMAIN): string {
  return buildPayUri({ destination, amount, assetCode: "USDC", assetIssuer: USDC_ISSUER, msg, originDomain });
}

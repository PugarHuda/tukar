// Shareable proof-of-payment link: `/verify#r=<payload>`. The receipt rides in the URL FRAGMENT,
// so it never reaches the server or its logs; /verify reads it client-side and re-runs the same
// on-chain verification the paste flow uses. Payload = base64url(deflate-raw(receipt JSON)):
// Groth16 field elements are ~77 random digits each, so a raw receipt is 1.5-3.5 KB and would not
// fit a QR; deflate brings the aggregate case under the QR byte-mode ceiling. Uses the native
// CompressionStream (browser + Node 18+), no dependency.
import type { AuditReceipt, DisclosureType } from "./zk";

export const RECEIPT_LINK_PATH = "/verify";
/** Fragment length cap (chars) and inflated JSON cap (bytes). Real receipts are well under both. */
export const MAX_LINK_PAYLOAD = 16 * 1024;
export const MAX_RECEIPT_BYTES = 64 * 1024;

const TYPES: DisclosureType[] = ["exact", "threshold", "aggregate", "range"];
// Public-signal layout each circuit exposes (lib/zk.verifyReceipt + lib/soroban/verify.ts index
// into these): a shorter receipt would read an undefined signal and throw mid-verify.
const MIN_SIGNALS: Record<DisclosureType, number> = { exact: 3, threshold: 3, range: 4, aggregate: 13 };
const isField = (s: unknown): s is string => typeof s === "string" && /^\d{1,78}$/.test(s);
const isHex64 = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/i.test(s);

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("not base64url");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pump(stream: ReadableStream<Uint8Array>, cap: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      reader.cancel().catch(() => {});
      throw new Error("receipt too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
function through(bytes: Uint8Array, ts: CompressionStream | DecompressionStream, cap: number) {
  const w = ts.writable.getWriter();
  w.write(bytes as BufferSource).then(() => w.close()).catch(() => {});
  return pump(ts.readable, cap);
}

/** Validate an untrusted object as an AuditReceipt (the shape lib/zk.makeReceipt produces). */
export function validateReceipt(j: unknown): AuditReceipt {
  const r = j as Record<string, unknown>;
  if (!r || typeof r !== "object" || Array.isArray(r)) throw new Error("receipt is not an object");
  if (r.kind !== "tukar-audit-receipt") throw new Error("not a Tukar audit receipt");
  if (r.version !== 1) throw new Error("unsupported receipt version");
  if (!TYPES.includes(r.type as DisclosureType)) throw new Error("unknown disclosure type");
  if (!Array.isArray(r.publicSignals) || !r.publicSignals.length || !r.publicSignals.every(isField)) throw new Error("malformed publicSignals");
  const need = MIN_SIGNALS[r.type as DisclosureType];
  if (r.publicSignals.length < need) throw new Error(`${r.type} receipt needs ${need} public signals, got ${r.publicSignals.length}`);
  const p = r.proof as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object" || !Array.isArray(p.pi_a) || !Array.isArray(p.pi_b) || !Array.isArray(p.pi_c)) throw new Error("malformed proof");
  if (typeof r.network !== "string" || typeof r.verifier !== "string" || typeof r.verifiedOnChain !== "boolean") throw new Error("malformed receipt metadata");
  if (r.anchor != null) {
    const a = r.anchor as Record<string, unknown>;
    if (!isHex64(a.txHash) || !isHex64(a.sha256)) throw new Error("malformed anchor");
  }
  return r as AuditReceipt;
}

/** Encode a receipt to the fragment payload (base64url of deflated JSON). */
export async function encodeReceiptPayload(r: AuditReceipt): Promise<string> {
  if (typeof CompressionStream === "undefined") throw new Error("this browser cannot build a verification link");
  const json = new TextEncoder().encode(JSON.stringify(validateReceipt(r)));
  const out = toBase64Url(await through(json, new CompressionStream("deflate-raw"), MAX_RECEIPT_BYTES));
  if (out.length > MAX_LINK_PAYLOAD) throw new Error("receipt too large for a link");
  return out;
}

/** Decode + validate a fragment payload. Throws a clear error on a malformed or oversized link. */
export async function decodeReceiptPayload(payload: string): Promise<AuditReceipt> {
  const s = payload.trim();
  if (!s) throw new Error("empty link payload");
  if (s.length > MAX_LINK_PAYLOAD) throw new Error("link payload too large");
  let json: unknown;
  try {
    const bytes = await through(fromBase64Url(s), new DecompressionStream("deflate-raw"), MAX_RECEIPT_BYTES);
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e: any) {
    if (e && e.message === "receipt too large") throw e;
    throw new Error("the link payload is corrupted or truncated");
  }
  return validateReceipt(json);
}

/** Full link (`${origin}/verify#r=<payload>`). `origin` defaults to the current page origin, else path-only. */
export async function receiptLink(r: AuditReceipt, origin = typeof location !== "undefined" ? location.origin : ""): Promise<string> {
  return `${origin}${RECEIPT_LINK_PATH}#r=${await encodeReceiptPayload(r)}`;
}

/** Read one `key=value` out of a location.hash (or full URL). Null when absent. */
export function fragmentParam(hash: string, key: string): string | null {
  const i = hash.indexOf("#");
  const m = new RegExp(`(?:^|[#&])${key}=([^&]*)`).exec(i < 0 ? hash : hash.slice(i));
  return m ? m[1] : null;
}
/** Pull the `r=` payload out of a location.hash (or full URL). Null when absent. */
export const receiptPayloadFromHash = (hash: string): string | null => fragmentParam(hash, "r");

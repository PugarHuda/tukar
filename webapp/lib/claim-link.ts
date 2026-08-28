// Claim links for receivers: `/receiver#claim=<payload>` wrapping the tukar1: bearer note the
// sender already hands over. The note is a BEARER SECRET: whoever holds the link holds the money.
// The optional 6-digit PIN wraps it with AES-GCM under PBKDF2-SHA256 (200k iterations, random
// salt + iv) so the link alone is useless in transit (a chat log, a screenshot). A 6-digit PIN is
// not a strong secret: it protects the link in transit, not against an attacker who has both the
// link and time. Fragment only, so the payload never reaches a server.
//
// Payload (versioned):  v1.<b64url(note)>                       plain
//                       v1.<b64url(salt)>.<b64url(iv)>.<b64url(ct)>  PIN-wrapped
import { toBase64Url, fromBase64Url, fragmentParam } from "./receipt-link";

export const CLAIM_LINK_PATH = "/receiver";
export const PBKDF2_ITERATIONS = 200_000;
const NOTE_PREFIX = "tukar1:";
const MAX_PAYLOAD = 8 * 1024;

export const isValidPin = (pin: string): boolean => /^\d{6}$/.test(pin);

async function pinKey(pin: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

/** Build the fragment payload for a bearer note, PIN-wrapped when `pin` is given. */
export async function encodeClaimPayload(note: string, pin?: string): Promise<string> {
  const n = note.trim();
  if (!n.startsWith(NOTE_PREFIX)) throw new Error("not a tukar1: bearer note");
  const bytes = new TextEncoder().encode(n);
  if (!pin) return `v1.${toBase64Url(bytes)}`;
  if (!isValidPin(pin)) throw new Error("PIN must be exactly 6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await pinKey(pin, salt, "encrypt");
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  return `v1.${toBase64Url(salt)}.${toBase64Url(iv)}.${toBase64Url(ct)}`;
}

/** True when the payload needs a PIN to open. Throws on a malformed payload. */
export function isPinWrapped(payload: string): boolean {
  const parts = payload.trim().split(".");
  if (parts[0] !== "v1" || (parts.length !== 2 && parts.length !== 4) || parts.some((p) => !p)) throw new Error("malformed claim link");
  if (payload.length > MAX_PAYLOAD) throw new Error("claim link too large");
  return parts.length === 4;
}

/**
 * Open a payload back into the tukar1: note. Throws "PIN required" for a wrapped payload with no
 * PIN, "Wrong PIN" when the PIN does not open it, and a malformed error otherwise.
 */
export async function openClaimPayload(payload: string, pin?: string): Promise<string> {
  const wrapped = isPinWrapped(payload);
  const parts = payload.trim().split(".");
  let note: string;
  if (!wrapped) {
    note = new TextDecoder().decode(fromBase64Url(parts[1]));
  } else {
    if (!pin) throw new Error("PIN required");
    if (!isValidPin(pin)) throw new Error("PIN must be exactly 6 digits");
    const [, salt, iv, ct] = parts.map(fromBase64Url);
    const key = await pinKey(pin, salt, "decrypt");
    try {
      note = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ct as BufferSource));
    } catch {
      throw new Error("Wrong PIN. Check the 6 digits and try again.");
    }
  }
  if (!note.startsWith(NOTE_PREFIX)) throw new Error("malformed claim link");
  return note;
}

/** Ready-to-use link: `${origin}/receiver#claim=<payload>`. `origin` defaults to the page origin, else path-only. */
export async function buildClaimLink(note: string, pin?: string, origin = typeof location !== "undefined" ? location.origin : ""): Promise<string> {
  return `${origin}${CLAIM_LINK_PATH}#claim=${await encodeClaimPayload(note, pin)}`;
}

/** Pull the `claim=` payload out of a location.hash (or full URL). Null when absent. */
export const claimPayloadFromHash = (hash: string): string | null => fragmentParam(hash, "claim");

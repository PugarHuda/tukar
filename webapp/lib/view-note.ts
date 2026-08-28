// Tukar — view-only note (tukview1:), a note-level viewing key for regulators. It carries the
// commitment OPENING (amount, pubKey, blinding) and never the privKey. Every disclosure circuit
// (exact / threshold / range / aggregate, see circuits/*.circom) takes exactly amount + pubKey +
// blinding as its private inputs, so a holder of this string can prove facts about the note; the
// transfer circuit needs privKey, so the same string cannot spend it. Pure: no chain access here.
import { getPoseidon, isFieldStr, R, type Note } from "./zk";

export type ViewNote = {
  v: 1;
  commitment: string; // decimal field element
  amount: string; // stroops, decimal string
  pubKey: string;
  blinding: string;
  corridor: string; // destination corridor code the sender tagged (e.g. "ID")
  depositTx?: string; // 64-hex Stellar tx hash of the deposit, when known
};

export const VIEW_NOTE_PREFIX = "tukview1:";
const BEARER_PREFIX = "tukar1:";

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(std + "=".repeat((4 - (std.length % 4)) % 4));
};

const isCanonicalField = (s: unknown): s is string => isFieldStr(s) && BigInt(s) < R;

/** Build a view-only note from a spendable note. The privKey is dropped here and never carried. */
export function viewNoteFromNote(note: Pick<Note, "amount" | "pubKey" | "blinding" | "commitment"> & { corridor: string; depositTx?: string }): ViewNote {
  const vn: ViewNote = { v: 1, commitment: note.commitment, amount: note.amount, pubKey: note.pubKey, blinding: note.blinding, corridor: note.corridor };
  if (note.depositTx) vn.depositTx = note.depositTx;
  return vn;
}

export function encodeViewNote(vn: ViewNote): string {
  // Rebuild the payload field by field so a caller passing a wider object (a bearer note with a
  // privKey, say) can never leak it into the string.
  const payload: ViewNote = { v: 1, commitment: vn.commitment, amount: vn.amount, pubKey: vn.pubKey, blinding: vn.blinding, corridor: vn.corridor };
  if (vn.depositTx) payload.depositTx = vn.depositTx;
  return VIEW_NOTE_PREFIX + b64url(JSON.stringify(payload));
}

/** Decode + strictly validate a tukview1: string. Throws a clear error on anything else. */
export function decodeViewNote(raw: string): ViewNote {
  const s = raw.trim();
  if (s.startsWith(BEARER_PREFIX)) throw new Error("this is a spendable bearer note (tukar1:), not a view-only note; do not share it with a regulator");
  if (!s.startsWith(VIEW_NOTE_PREFIX)) throw new Error("not a Tukar view-only note (expected a tukview1: string)");
  let json: any;
  try {
    json = JSON.parse(unb64url(s.slice(VIEW_NOTE_PREFIX.length)));
  } catch {
    throw new Error("malformed view-only note");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("malformed view-only note");
  if (json.v !== 1) throw new Error("unsupported view-only note version");
  if ("privKey" in json) throw new Error("this string carries a private key; a view-only note must not");
  for (const k of ["commitment", "amount", "pubKey", "blinding"] as const) {
    if (!isCanonicalField(json[k])) throw new Error("malformed or missing field: " + k);
  }
  if (typeof json.corridor !== "string" || !/^[A-Z]{2}$/.test(json.corridor)) throw new Error("malformed or missing corridor code");
  if (json.depositTx !== undefined && (typeof json.depositTx !== "string" || !/^[0-9a-f]{64}$/i.test(json.depositTx))) {
    throw new Error("malformed depositTx (expected a 64-hex Stellar transaction hash)");
  }
  const vn: ViewNote = { v: 1, commitment: json.commitment, amount: json.amount, pubKey: json.pubKey, blinding: json.blinding, corridor: json.corridor };
  if (json.depositTx) vn.depositTx = json.depositTx.toLowerCase();
  return vn;
}

/** Poseidon(amount, pubKey, blinding), the same hash newNote() commits with. Decimal string. */
export async function recomputeCommitment(vn: Pick<ViewNote, "amount" | "pubKey" | "blinding">): Promise<string> {
  const { poseidon, F } = await getPoseidon();
  return F.toObject(poseidon([BigInt(vn.amount), BigInt(vn.pubKey), BigInt(vn.blinding)])).toString();
}

// Server-safe bearer-note status helper for /api/note-status. NO browser deps: it reads the
// pool with read-only RPC simulations via @stellar/stellar-sdk and derives the nullifier with
// Poseidon (circomlibjs, dynamic-imported). It deliberately re-implements the few RPC-only bits
// it needs (its own POOL-fixed simulate that PROPAGATES errors, plus leaf pagination, and the same
// tukar1: decode + nullifier = Poseidon(commitment, leafIndex, privKey) that the receiver uses)
// instead of importing lib/stellar.ts / lib/zk.ts, whose module graphs pull browser-only code.
// buf32 comes from the browser-free lib/soroban/proof (shared, no drift).
import * as Sdk from "@stellar/stellar-sdk";
import { PASSPHRASE, POOL, SOURCE } from "./constants";
import { buf32 } from "./soroban/proof"; // shared server-safe copy (was re-implemented below)
import { server } from "./soroban/rpc"; // shared client with a request timeout

// Read-only contract simulation against the live pool. Throws on a sim/RPC error so the caller
// can honestly report "couldn't read the chain" rather than silently treating it as "absent".
async function simulate(method: string, ...args: Sdk.xdr.ScVal[]): Promise<any> {
  const source = await server.getAccount(SOURCE);
  const c = new Sdk.Contract(POOL);
  const tx = new Sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(c.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) throw new Error(String(sim.error));
  return Sdk.scValToNative(sim.result!.retval);
}

const bytesToBig = (u8: Iterable<number>): bigint => {
  let x = 0n;
  for (const b of u8) x = (x << 8n) | BigInt(b);
  return x;
};
const u32 = (x: number) => Sdk.nativeToScVal(x, { type: "u32" });
const isFieldStr = (s: unknown): s is string => typeof s === "string" && /^\d{1,78}$/.test(s);

// The ordered on-chain Merkle leaves (deposited + registered commitments), paginated. Same
// read as lib/stellar.ts loadLeavesFromChain, but PROPAGATES errors (no swallow-to-[]).
async function loadLeaves(): Promise<bigint[]> {
  const n = Number(await simulate("leaf_count"));
  const out: bigint[] = [];
  const CHUNK = 64;
  for (let start = 0; start < n; start += CHUNK) {
    const r = await simulate("leaf_range", u32(start), u32(CHUNK));
    if (!Array.isArray(r)) throw new Error("leaf_range returned a non-array");
    for (const b of r) out.push(bytesToBig(b));
  }
  return out;
}

const isNullifierUsed = (nullifierDec: string | bigint): Promise<boolean> =>
  simulate("is_nullifier_used", Sdk.nativeToScVal(buf32(nullifierDec), { type: "bytes" })).then((v) => v === true);
// Exported for the push watcher (lib/push.ts), which stores only the nullifier a client derived and
// asks "is it on-chain yet" without ever holding the bearer note. Throws on an RPC failure.
export const nullifierSpent = isNullifierUsed;
const isCommitmentKnown = (commitmentDec: string | bigint): Promise<boolean> =>
  simulate("is_commitment_known", Sdk.nativeToScVal(buf32(commitmentDec), { type: "bytes" })).then((v) => v === true);

let _poseidon: any = null;
let _F: any = null;
async function getPoseidon(): Promise<{ poseidon: any; F: any }> {
  if (!_poseidon) {
    const { buildPoseidon } = await import("circomlibjs");
    _poseidon = await buildPoseidon();
    _F = _poseidon.F;
  }
  return { poseidon: _poseidon, F: _F };
}

// Decode the private inputs we need from the caller's input. A tukar1: bearer note carries the
// privKey (so the nullifier is derivable); a bare commitment does not (nullifier undecidable).
function parseInput(input: { note?: string; commitment?: string }): { commitment: string; privKey?: string } {
  const raw = (input.note || "").trim();
  if (raw) {
    const b64 = raw.replace(/^tukar1:/, "");
    let json: any;
    try {
      json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    } catch {
      throw new Error("could not decode the bearer note (not a valid tukar1: string)");
    }
    if (!isFieldStr(json.commitment)) throw new Error("bearer note has no valid commitment");
    if (!isFieldStr(json.privKey)) throw new Error("bearer note has no valid private key");
    return { commitment: String(json.commitment), privKey: String(json.privKey) };
  }
  const cmt = String(input.commitment || "").trim();
  if (!isFieldStr(cmt)) throw new Error("provide a tukar1: note, or a decimal commitment field element");
  return { commitment: cmt };
}

export type NoteStatus = {
  status: "unregistered" | "spendable" | "spent" | "unknown";
  knownLeaf: boolean | null; // in the on-chain leaf set (null = chain read failed)
  nullifierSpent: boolean | null; // null = not derivable (no note secret) or chain read failed
  commitment: string;
  deposited?: boolean; // is_commitment_known: deposited but maybe not yet a registered leaf
  reason: string;
};

/**
 * Answer, from public pool state alone, whether a bearer note is unregistered / spendable /
 * already spent. Reads the leaf set (membership + leafIndex), then — only when the input is a
 * full note carrying the private key — derives nullifier = Poseidon(commitment, leafIndex,
 * privKey) and checks is_nullifier_used. Without the secret the spent state can't be derived,
 * so nullifierSpent stays null and status is "unknown" rather than a guess.
 */
export async function noteStatus(input: { note?: string; commitment?: string }): Promise<NoteStatus> {
  const { commitment, privKey } = parseInput(input); // throws on bad input -> 400 at the route

  let leaves: bigint[];
  try {
    leaves = await loadLeaves();
  } catch {
    return {
      status: "unknown",
      knownLeaf: null,
      nullifierSpent: null,
      commitment,
      reason: "Could not read the pool on-chain right now (RPC read failed). Try again in a moment.",
    };
  }

  const target = BigInt(commitment);
  const leafIndex = leaves.findIndex((l) => l === target);
  const knownLeaf = leafIndex >= 0;

  if (!knownLeaf) {
    // Not a registered leaf. Distinguish "deposited but not yet registered into the tree" from
    // "the pool has never seen this commitment" via is_commitment_known (best-effort).
    let deposited = false;
    try {
      deposited = await isCommitmentKnown(commitment);
    } catch {}
    return {
      status: "unregistered",
      knownLeaf: false,
      nullifierSpent: null,
      commitment,
      deposited,
      reason: deposited
        ? "Deposited on-chain but not yet registered as a tree leaf. Withdrawing finishes that registration first, then spends it."
        : "The pool has no leaf for this commitment. It has not been deposited (or a matching deposit hasn't landed yet).",
    };
  }

  if (!privKey) {
    return {
      status: "unknown",
      knownLeaf: true,
      nullifierSpent: null,
      commitment,
      reason: "Registered on-chain, but the spent/unspent state can't be checked from a bare commitment. Paste the full tukar1: note (it carries the key needed to derive the nullifier).",
    };
  }

  let nullifierSpent: boolean;
  try {
    const { poseidon, F } = await getPoseidon();
    const nullifier = F.toObject(poseidon([target, BigInt(leafIndex), BigInt(privKey)]));
    nullifierSpent = await isNullifierUsed(nullifier.toString());
  } catch {
    return {
      status: "unknown",
      knownLeaf: true,
      nullifierSpent: null,
      commitment,
      reason: "Registered on-chain, but the nullifier check couldn't be completed (chain read failed). Try again in a moment.",
    };
  }

  return {
    status: nullifierSpent ? "spent" : "spendable",
    knownLeaf: true,
    nullifierSpent,
    commitment,
    reason: nullifierSpent
      ? "Already spent. Its nullifier is on-chain, so there is nothing left to withdraw."
      : "Registered on-chain and not yet spent. This note can be withdrawn.",
  };
}

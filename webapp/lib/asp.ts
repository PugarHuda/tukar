// Server-safe ASP allow-list helper: given a Reclaim-verified account, compute the NEW
// Poseidon Merkle root that includes it, the regenerated asp-witness.json, and the exact
// admin `set_asp_root` CLI. Reuses the SAME leaf function (addrField) and the SAME tree
// shape as scripts/build-asp.mjs (Poseidon(2) internal node, empty leaf 0, LEVELS=10,
// N=16, padding leaf i = Poseidon(2000+i)). No admin secret is used or held here — the
// server only computes; the corridor operator applies the write with their own key.
import { buildPoseidon } from "circomlibjs";
import { addrField } from "./stellar";
import { POOL, SOURCE } from "./constants";
import witness from "@/public/circuit/asp-witness.json";

const LEVELS = 10;
const N = 16;
// corridor operator (admin = "corredor"); SOURCE holds this pubkey, no secret is present.
const ADMIN = SOURCE;

type Poseidon = { h1: (a: bigint) => bigint; h2: (a: bigint, b: bigint) => bigint };
let _pos: Poseidon | null = null;
async function poseidon(): Promise<Poseidon> {
  if (!_pos) {
    const p = await buildPoseidon();
    _pos = { h1: (a) => p.F.toObject(p([a])), h2: (a, b) => p.F.toObject(p([a, b])) };
  }
  return _pos;
}

// Same algorithm as scripts/merkle.mjs buildTree: depth-LEVELS tree, padded with 0.
function buildTree(h2: (a: bigint, b: bigint) => bigint, leaves: bigint[], levels: number) {
  const size = 1 << levels;
  const layer0 = new Array<bigint>(size).fill(0n);
  for (let i = 0; i < leaves.length; i++) layer0[i] = leaves[i] ?? 0n;
  const layers = [layer0];
  for (let l = 0; l < levels; l++) {
    const prev = layers[l];
    const next = new Array<bigint>(prev.length / 2);
    for (let i = 0; i < next.length; i++) next[i] = h2(prev[2 * i], prev[2 * i + 1]);
    layers.push(next);
  }
  const root = layers[levels][0];
  const proof = (index: number) => {
    const pathElements: bigint[] = [];
    let idx = index;
    for (let l = 0; l < levels; l++) {
      pathElements.push(layers[l][idx ^ 1]);
      idx >>= 1;
    }
    return { pathElements, leafIndex: index };
  };
  return { root, proof };
}

// Fold a leaf up its path (pathIndices = bits of leafIndex, LSB-first) — the same rule
// merkleProof.circom enforces. Used as the append round-trip self-check.
function foldRoot(h2: (a: bigint, b: bigint) => bigint, leaf: bigint, leafIndex: number, path: bigint[]): bigint {
  let acc = leaf;
  let idx = leafIndex;
  for (const sib of path) {
    acc = idx & 1 ? h2(sib, acc) : h2(acc, sib);
    idx >>= 1;
  }
  return acc;
}

function buildCli(rootHex: string): string {
  return [
    "stellar contract invoke \\",
    `  --id ${POOL} \\`,
    `  --source ${ADMIN} \\`,
    "  --network testnet \\",
    "  -- \\",
    "  set_asp_root \\",
    `  --asp_root ${rootHex}`,
  ].join("\n");
}

export type AllowlistUpdate = {
  address: string;
  alreadyListed: boolean;
  leafIndex: number;
  newRoot: string; // decimal
  newRootHex: string; // 32-byte hex, the set_asp_root arg
  setAspRootCli: string;
  updatedWitness: typeof witness;
};

/**
 * Extend the REAL live allow-list with `address`: verify the current witness leaves still
 * reproduce the recorded aspRoot, append addrField(address) into the first free padding
 * slot, recompute the Poseidon root, and emit the operator's set_asp_root CLI. Idempotent:
 * if the account is already a leaf, returns the unchanged root and alreadyListed=true.
 */
export async function computeAllowlistUpdate(address: string): Promise<AllowlistUpdate> {
  const { h1, h2 } = await poseidon();

  // Current leaves, ordered by leafIndex (defensive: don't assume file order).
  const leaves = new Array<bigint>(N).fill(0n);
  for (const m of witness.members) leaves[Number(m.leafIndex)] = BigInt(m.sourceKey);

  // Extend the REAL tree, not a fabricated one: the stored leaves must reproduce the root.
  if (buildTree(h2, leaves, LEVELS).root.toString() !== witness.aspRoot) {
    throw new Error("current ASP witness leaves do not reproduce the recorded aspRoot");
  }

  const leaf = BigInt(addrField(address));

  // Idempotent: already allow-listed.
  const existing = leaves.findIndex((l) => l === leaf);
  if (existing >= 0) {
    const rootHex = BigInt(witness.aspRoot).toString(16).padStart(64, "0");
    return {
      address,
      alreadyListed: true,
      leafIndex: existing,
      newRoot: witness.aspRoot,
      newRootHex: rootHex,
      setAspRootCli: buildCli(rootHex),
      updatedWitness: witness,
    };
  }

  // First free padding slot (leaf i == Poseidon(2000+i)); index 0 is the demo key, never touched.
  let slot = -1;
  for (let i = 1; i < N; i++) {
    if (leaves[i] === h1(BigInt(2000 + i))) {
      slot = i;
      break;
    }
  }
  if (slot < 0) throw new Error("ASP allow-list is full (all 16 slots occupied)");

  leaves[slot] = leaf;
  const tree = buildTree(h2, leaves, LEVELS);

  // Self-check: the appended leaf must fold back to the recomputed root.
  const { pathElements, leafIndex } = tree.proof(slot);
  if (foldRoot(h2, leaf, leafIndex, pathElements) !== tree.root) {
    throw new Error("ASP append self-check failed: leaf does not fold to the new root");
  }

  const members = leaves.map((sk, i) => {
    const p = tree.proof(i);
    return {
      sourceKey: sk.toString(),
      leafIndex: String(p.leafIndex),
      pathElements: p.pathElements.map((x) => x.toString()),
    };
  });
  const newRoot = tree.root.toString();
  const newRootHex = tree.root.toString(16).padStart(64, "0");
  const updatedWitness = {
    aspRoot: newRoot,
    denyList: witness.denyList,
    members,
    sourceKey: members[0].sourceKey,
    leafIndex: members[0].leafIndex,
    pathElements: members[0].pathElements,
  };

  return {
    address,
    alreadyListed: false,
    leafIndex: slot,
    newRoot,
    newRootHex,
    setAspRootCli: buildCli(newRootHex),
    updatedWitness,
  };
}

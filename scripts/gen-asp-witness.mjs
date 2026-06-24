// Emit the ASP membership witnesses the browser needs to build a compliance proof
// for an on-chain deposit. The allow-list is a Poseidon Merkle tree of N distinct
// approved sources; the witness exports EVERY member (key + path) so each deposit
// can prove a DIFFERENT source is allow-listed (per-user compliance) — without
// revealing which one. Matches the deployed pool's pinned aspRoot + deny-list.
import { makePoseidon, buildTree } from "./merkle.mjs";
import { writeFileSync } from "node:fs";

const LEVELS = 10;
const N = 16; // distinct approved sources in the allow-list
const { h1, h2 } = await makePoseidon();

// N distinct source keys (disjoint from the deny-list values below).
const sourceKeys = [];
for (let i = 1; i <= N; i++) sourceKeys.push(h1(BigInt(1000 + i)));
const tree = buildTree(h2, sourceKeys, LEVELS);

const members = sourceKeys.map((sk, i) => {
  const { pathElements, leafIndex } = tree.proof(i);
  return {
    sourceKey: sk.toString(),
    leafIndex: leafIndex.toString(),
    pathElements: pathElements.map((x) => x.toString()),
  };
});

const witness = {
  aspRoot: tree.root.toString(),
  denyList: [h1(9001n), h1(9002n), h1(9003n), h1(9004n)].map((d) => d.toString()),
  members,
  // single-member fields kept for backward-compat (member 0)
  sourceKey: members[0].sourceKey,
  leafIndex: members[0].leafIndex,
  pathElements: members[0].pathElements,
};
writeFileSync("frontend/circuit/asp-witness.json", JSON.stringify(witness));
console.log("wrote frontend/circuit/asp-witness.json —", N, "approved sources");
console.log("aspRoot dec:", witness.aspRoot);
console.log("aspRoot hex:", BigInt(witness.aspRoot).toString(16).padStart(64, "0"));
console.log("denyList hex:", witness.denyList.map((d) => BigInt(d).toString(16).padStart(64, "0")));

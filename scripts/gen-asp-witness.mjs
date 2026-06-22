// Emit the fixed ASP membership witness the browser needs to build a compliance
// proof for an on-chain deposit. Matches the deployed pool's pinned aspRoot +
// deny-list (same allow-list as gen-input-compliance.mjs / the deployed verifier).
import { makePoseidon, buildTree } from "./merkle.mjs";
import { writeFileSync } from "node:fs";

const LEVELS = 10;
const { h1, h2 } = await makePoseidon();

const sourceKey = h1(424242n);
const leaves = [];
[h1(1n), h1(2n), h1(3n), h1(4n)].forEach((m, i) => (leaves[i] = m));
leaves[5] = sourceKey;
const tree = buildTree(h2, leaves, LEVELS);
const { pathElements, leafIndex } = tree.proof(5);

const witness = {
  aspRoot: tree.root.toString(),
  denyList: [h1(9001n), h1(9002n), h1(9003n), h1(9004n)].map((d) => d.toString()),
  sourceKey: sourceKey.toString(),
  leafIndex: leafIndex.toString(),
  pathElements: pathElements.map((x) => x.toString()),
};
writeFileSync("frontend/circuit/asp-witness.json", JSON.stringify(witness));
console.log("wrote frontend/circuit/asp-witness.json");
console.log("aspRoot:", witness.aspRoot);

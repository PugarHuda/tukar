// Expected roots for src/test.rs, computed with circomlibjs via the repo's own
// scripts/merkle.mjs (the same helper the prover/frontend use). Run: node gen-vectors.mjs
import { makePoseidon, buildTree } from "../../scripts/merkle.mjs";
const { h2 } = await makePoseidon();
const hex = (x) => x.toString(16).padStart(64, "0");
const leaves = [1n, 2n, 3n, 0x2a3617f2743245519e19607a4417189a115cc0f5e7d690413df64c6b9662e9cfn, 5n];
const out = { empty: hex(buildTree(h2, [], 10).root), roots: [] };
for (let i = 1; i <= leaves.length; i++) out.roots.push(hex(buildTree(h2, leaves.slice(0, i), 10).root));
out.leaves = leaves.map(hex);
out.full = hex(buildTree(h2, Array.from({ length: 1024 }, (_, i) => BigInt(i + 1)), 10).root);
console.log(JSON.stringify(out, null, 1));

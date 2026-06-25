// Emit the ASP allow-list witness for the KEY-ON-FROM compliance model: each
// allow-list leaf is a field derived from an APPROVED Stellar account
// (`field(addr) = keccak256(addr ScVal XDR) mod r`). A deposit proves that the
// authenticated depositor's `field(from)` is a member — so the proof authenticates
// THIS depositor, not just "some member". The demo key is approved (index 0) so the
// no-install demo works; the rest are inert padding (no one holds those accounts).
//
// field(demoKey) is computed in a browser context (needs the Stellar SDK to build
// the address XDR) — see scripts: it is passed in as DEMO_FIELD below.
import { makePoseidon, buildTree } from "./merkle.mjs";
import { writeFileSync } from "node:fs";

const LEVELS = 10;
const N = 16;
// field(GBJSZAEY... the demo key) = keccak256(addr ScVal XDR) mod r — MUST match
// the contract's on-chain `field(from)` (verified live).
const DEMO_FIELD = 3464883877822031025763569367645394085039005080696093310748210675376030260228n;
const { h1, h2 } = await makePoseidon();

// Allow-list: the demo key at index 0 + inert padding members.
const sources = [DEMO_FIELD];
for (let i = 1; i < N; i++) sources.push(h1(BigInt(2000 + i)));
const tree = buildTree(h2, sources, LEVELS);

const members = sources.map((sk, i) => {
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
  members, // member 0 == field(demo key); the frontend matches by field(from)
  sourceKey: members[0].sourceKey,
  leafIndex: members[0].leafIndex,
  pathElements: members[0].pathElements,
};
writeFileSync("frontend/circuit/asp-witness.json", JSON.stringify(witness));
console.log("wrote frontend/circuit/asp-witness.json — demo key approved at index 0");
console.log("aspRoot dec:", witness.aspRoot);
console.log("aspRoot hex:", BigInt(witness.aspRoot).toString(16).padStart(64, "0"));

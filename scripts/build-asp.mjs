// Build a CONFIGURABLE ASP allow-list from REAL approved Stellar accounts — the
// production shape of the compliance "policy registry", widening past the original
// single-witness seed. Each allow-list leaf is field(addr) = keccak256(addr ScVal
// XDR) mod r, the exact value the pool pins as field(from) on deposit (verified: it
// reproduces the demo key's on-chain field). So a deposit proves THIS authenticated
// account is approved — and any number of approved accounts can be added.
//
//   node scripts/build-asp.mjs                    # default: demo key only
//                                                 # (reproduces the deployed aspRoot)
//   node scripts/build-asp.mjs GABC... GDEF...    # widen: add approved public keys
//
// Widening changes the root, so the script prints the exact `set_asp_root` call the
// pool admin runs to point the LIVE policy at the new allow-list (no redeploy).
import * as Sdk from "@stellar/stellar-sdk";
import sha3 from "js-sha3";
import { makePoseidon, buildTree } from "./merkle.mjs";
import { writeFileSync } from "node:fs";

const keccak256 = sha3.keccak256;
const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const field = (addr) => BigInt("0x" + keccak256(Sdk.nativeToScVal(addr, { type: "address" }).toXDR())) % FIELD_R;

const LEVELS = 10, N = 16;
const DEMO = "GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ";

// Demo key stays index 0 so the no-install demo keeps working. Extra public keys
// (CLI args) widen the allow-list. field() is computed here, so anyone can be added
// by public key alone — no browser/SDK dance, no hand-copied field constant.
const APPROVED = [DEMO, ...process.argv.slice(2)];
for (const a of APPROVED) {
  if (!/^G[A-Z2-7]{55}$/.test(a)) throw new Error("not a Stellar public key: " + a);
}

const { h1, h2 } = await makePoseidon();
// Real approved members first, then inert padding (h1(2000+i)) — identical padding to
// the original tooling, so APPROVED=[demo] yields the exact deployed root (non-breaking).
const sources = APPROVED.map(field);
for (let i = sources.length; i < N; i++) sources.push(h1(BigInt(2000 + i)));
const tree = buildTree(h2, sources, LEVELS);

const members = sources.map((sk, i) => {
  const { pathElements, leafIndex } = tree.proof(i);
  return { sourceKey: sk.toString(), leafIndex: leafIndex.toString(), pathElements: pathElements.map((x) => x.toString()) };
});

// Deny-list: 8 deterministic sanctioned testnet accounts (ed25519 0x91..0x98) — the
// compliance circuit is now Compliance(10, 8), so the block-list holds 8 entries.
const DENY_SANCTIONED = [
  "3082132687368863516150381708866164029952132851772459186640452982606694939745",
  "12744456281845219501046754656790092100606383966049268766255332742813719532583",
  "6228627607882016519908452747090894579594818906802039072243571290666355853281",
  "17052486854034810142609536060076645562758373809480125614291672959189632001501",
  "19160238206645417565435552501357226640608246435960603409836792300745984541788",
  "13283313265745827773611269337903053917808973162329767884686477464641094796482",
  "9891337141733951824928717189490758340694197248394040439372339072338898937745",
  "15830677113839618058826391314371716600830438173399892421021091049039469147086",
];

// Same object shape/key order as the original tooling, so the default run is
// byte-identical to the deployed witness (no spurious diff, no re-verification churn).
const witness = {
  aspRoot: tree.root.toString(),
  denyList: DENY_SANCTIONED,
  members,
  sourceKey: members[0].sourceKey,
  leafIndex: members[0].leafIndex,
  pathElements: members[0].pathElements,
};
writeFileSync("frontend/circuit/asp-witness.json", JSON.stringify(witness));

console.log(`ASP allow-list: ${APPROVED.length} approved account(s) + ${N - APPROVED.length} inert padding`);
APPROVED.forEach((a, i) => console.log(`  [${i}] ${a}${i === 0 ? "  (demo key)" : ""}`));
const rootHex = BigInt(witness.aspRoot).toString(16).padStart(64, "0");
console.log("aspRoot dec:", witness.aspRoot);
console.log("aspRoot hex:", rootHex);
if (APPROVED.length > 1) {
  console.log("\nWiden the LIVE pool policy (admin only, no redeploy):");
  console.log(`  stellar contract invoke --id <POOL_ID> --source <ADMIN> -- \\`);
  console.log(`    set_asp_root --asp_root ${rootHex}`);
} else {
  console.log("\n(default demo-only build — reproduces the deployed aspRoot; nothing to update)");
}

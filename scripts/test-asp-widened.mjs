// Soundness test for the WIDENED ASP allow-list: a multi-member policy built from
// REAL Stellar accounts (not a single seeded witness). Generates REAL Groth16
// compliance proofs and checks the circuit itself enforces the policy:
//   1. a non-demo approved member proves membership -> verifies true, bound to its key
//   2. a non-member is rejected (aspRoot mismatch, no valid witness)
//   3. a deny-listed approved account is rejected (non-membership check)
//   4. the demo-only build still reproduces the DEPLOYED aspRoot (non-breaking)
//
//   node scripts/test-asp-widened.mjs
import * as Sdk from "@stellar/stellar-sdk";
import sha3 from "js-sha3";
import * as snarkjs from "snarkjs";
import { makePoseidon, buildTree } from "./merkle.mjs";
import { readFileSync } from "node:fs";

const keccak256 = sha3.keccak256;
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const field = (addr) => BigInt("0x" + keccak256(Sdk.nativeToScVal(addr, { type: "address" }).toXDR())) % R;
const pub = (b) => Sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, b)).publicKey();
const WASM = "circuits/build/compliance_js/compliance.wasm";
const ZKEY = "circuits/build/compliance_final.zkey";
const LEVELS = 10, N = 16, BIND = "987654321";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + " — " + e); };

const { h1, h2 } = await makePoseidon();
const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);

// A widened allow-list: 5 real approved accounts (deterministic seeds 0xA1..0xA5).
const approved = [0xa1, 0xa2, 0xa3, 0xa4, 0xa5].map(pub);
const sources = approved.map(field);
for (let i = sources.length; i < N; i++) sources.push(h1(BigInt(2000 + i)));
const tree = buildTree(h2, sources, LEVELS);
const denyFields = [0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98].map((b) => field(pub(b)));

const inputFor = (idx, deny = denyFields, keyOverride = null) => {
  const { pathElements, leafIndex } = tree.proof(idx);
  return {
    aspRoot: tree.root.toString(), denyList: deny.map(String),
    sourceKey: (keyOverride ?? sources[idx]).toString(), bindHash: BIND,
    pathElements: pathElements.map(String), leafIndex: String(leafIndex),
  };
};

console.log("Widened ASP soundness (5 real approved accounts)\n");

// 1) a non-demo approved member proves + verifies, bound to its own key
await (async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputFor(3), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    // public order: [aspRoot, denyList x8, sourceKey, bindHash] -> sourceKey at index 9
    const boundKey = publicSignals[9] === sources[3].toString();
    if (verified && boundKey) ok(`approved member #3 (${approved[3].slice(0, 8)}…) proves membership + verifies, bound to its key`);
    else bad("approved member #3", `verified=${verified} boundKey=${boundKey}`);
  } catch (e) { bad("approved member #3", e.message.split("\n")[0]); }
})();

// 2) a non-member (not in the tree) can't produce a valid proof
await (async () => {
  const outsider = field(pub(0xb0)); // never inserted
  try {
    await snarkjs.groth16.fullProve(inputFor(3, denyFields, outsider), WASM, ZKEY); // outsider key + member3 path
    bad("non-member rejected", "a proof was generated for a non-member");
  } catch { ok("non-member rejected by the circuit (aspRoot mismatch — no valid witness)"); }
})();

// 3) a deny-listed approved account is rejected even though it's in the allow-list
await (async () => {
  const denyWithMember = [sources[2], denyFields[1], denyFields[2], denyFields[3], denyFields[4], denyFields[5], denyFields[6], denyFields[7]];
  try {
    await snarkjs.groth16.fullProve(inputFor(2, denyWithMember), WASM, ZKEY);
    bad("deny-listed member rejected", "a proof was generated for a deny-listed account");
  } catch { ok("deny-listed approved account rejected by the circuit (non-membership check)"); }
})();

// 4) non-breaking: the demo-only allow-list still reproduces the DEPLOYED aspRoot
await (async () => {
  try {
    const DEMO = "GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ";
    const ds = [field(DEMO)];
    for (let i = 1; i < N; i++) ds.push(h1(BigInt(2000 + i)));
    const demoRoot = buildTree(h2, ds, LEVELS).root.toString();
    const live = JSON.parse(readFileSync("frontend/circuit/asp-witness.json", "utf8")).aspRoot;
    if (demoRoot === live) ok("demo-only build reproduces the deployed aspRoot (widening is non-breaking)");
    else bad("non-breaking", `demo root ${demoRoot.slice(0, 12)}… != live ${String(live).slice(0, 12)}…`);
  } catch (e) { bad("non-breaking", e.message.split("\n")[0]); }
})();

console.log(`\n=== ${pass}/${pass + fail} ASP-widening checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

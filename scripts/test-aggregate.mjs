// Soundness test for the AGGREGATE (portfolio) disclosure circuit: prove the SUM of N
// confidential payments is at most a reporting cap WITHOUT revealing any individual
// amount. A valid proof must exist only when the total <= cap, no individual amount may
// appear in the public signals, and a wrong commitment / over-cap total is unprovable.
//
//   node scripts/test-aggregate.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const WASM = "circuits/build/aggregateDisclosure_js/aggregateDisclosure.wasm";
const ZKEY = "circuits/build/aggregateDisclosure_final.zkey";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);

// Three confidential notes; amounts hidden inside their commitments.
const amounts = [500n, 300n, 150n]; // total 950
const pubKeys = [111n, 222n, 333n];
const blindings = [9991n, 9992n, 9993n];
const commitments = amounts.map((a, i) => H3(a, pubKeys[i], blindings[i]));
const ctx = "424242";

const input = (amts, cap, commits = null) => ({
  commitments: (commits ?? amts.map((a, i) => H3(a, pubKeys[i], blindings[i]))).map(String),
  cap: cap.toString(), auditContextHash: ctx,
  amounts: amts.map(String), pubKeys: pubKeys.map(String), blindings: blindings.map(String),
});

console.log("Aggregate (portfolio) disclosure soundness\n");

// 1) total (950) <= cap (1000): proves + verifies, and NO individual amount is revealed
await (async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input(amounts, 1000n), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    // public = [commitments(3), cap, auditContextHash] — no individual amount may leak
    const leaks = amounts.some((a) => publicSignals.includes(a.toString()));
    if (verified && !leaks && publicSignals[3] === "1000") ok("total (950 ≤ 1000) proves + verifies, no individual amount in public signals");
    else bad("under cap", `verified=${verified} leaksAmount=${leaks}`);
  } catch (e) { bad("under cap", e.message.split("\n")[0]); }
})();

// 2) total exactly at the cap (950 <= 950) still passes (inclusive)
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(amounts, 950n), WASM, ZKEY);
    ok("at cap (950 ≤ 950) proves (boundary inclusive)");
  } catch (e) { bad("at cap", e.message.split("\n")[0]); }
})();

// 3) total over the cap (950 > 900): the predicate can't be satisfied → unprovable
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(amounts, 900n), WASM, ZKEY);
    bad("over cap rejected", "a proof was generated for total > cap");
  } catch { ok("over cap (950 > 900) is UNPROVABLE (predicate not satisfiable)"); }
})();

// 4) a wrong commitment (swap one amount but keep its commitment) is unprovable
await (async () => {
  try {
    // commitments bind [500,300,150] but we claim [200,300,150] for the same commitments
    await snarkjs.groth16.fullProve(input([200n, 300n, 150n], 1000n, commitments), WASM, ZKEY);
    bad("commitment binding", "proof generated for an amount that doesn't open its commitment");
  } catch { ok("a claimed amount that doesn't open its commitment is UNPROVABLE (binding holds)"); }
})();

console.log(`\n=== ${pass}/${pass + fail} aggregate-disclosure checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

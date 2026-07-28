// Soundness test for the THRESHOLD (range) disclosure circuit: prove a payment is
// at most a reporting threshold WITHOUT revealing the exact amount. A valid proof
// must exist only when amount <= threshold, the exact amount must never appear in the
// public signals, and a wrong commitment / over-threshold amount must be unprovable.
//
//   node scripts/test-threshold.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const WASM = "circuits/build/thresholdDisclosure_js/thresholdDisclosure.wasm";
const ZKEY = "circuits/build/thresholdDisclosure_final.zkey";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);

// A confidential note: amount hidden inside the commitment.
const amount = 500n, pubKey = 111222333n, blinding = 999888777n;
const commitment = H3(amount, pubKey, blinding);
const ctx = "424242";

const input = (amt, thr, commit = null) => ({
  commitment: (commit ?? H3(amt, pubKey, blinding)).toString(),
  threshold: thr.toString(), auditContextHash: ctx,
  amount: amt.toString(), pubKey: pubKey.toString(), blinding: blinding.toString(),
});

console.log("Threshold disclosure soundness\n");

// 1) amount (500) <= threshold (1000): proves + verifies, and the amount is NOT revealed
await (async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input(amount, 1000n), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    // public = [commitment, threshold, auditContextHash] — the exact amount must NOT appear
    const leaks = publicSignals.includes(amount.toString());
    if (verified && !leaks && publicSignals[1] === "1000") ok("under threshold (500 ≤ 1000) proves + verifies, exact amount NOT in public signals");
    else bad("under threshold", `verified=${verified} leaksAmount=${leaks}`);
  } catch (e) { bad("under threshold", e.message.split("\n")[0]); }
})();

// 2) amount exactly at the threshold (1000 <= 1000) still passes (inclusive)
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(1000n, 1000n), WASM, ZKEY);
    ok("at threshold (1000 ≤ 1000) proves (boundary inclusive)");
  } catch (e) { bad("at threshold", e.message.split("\n")[0]); }
})();

// 3) amount over the threshold (2000 > 1000): the predicate can't be satisfied → unprovable
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(2000n, 1000n), WASM, ZKEY);
    bad("over threshold rejected", "a proof was generated for amount > threshold");
  } catch { ok("over threshold (2000 > 1000) is UNPROVABLE (predicate not satisfiable)"); }
})();

// 4) a wrong commitment (claim a different amount than what's committed) is unprovable
await (async () => {
  try {
    // commit to 500 but try to prove about a claimed amount of 200
    await snarkjs.groth16.fullProve(input(200n, 1000n, commitment), WASM, ZKEY);
    bad("commitment binding", "proof generated for an amount that doesn't open the commitment");
  } catch { ok("mismatched amount vs commitment is UNPROVABLE (binding holds)"); }
})();

console.log(`\n=== ${pass}/${pass + fail} threshold-disclosure checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

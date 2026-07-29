// Soundness test for the two-sided RANGE disclosure circuit: prove lower <= amount <= upper
// WITHOUT revealing the amount. A valid proof must exist only when the amount is inside the
// band; the exact amount must never appear in the public signals; and a wrong commitment or
// an out-of-band amount must be unprovable.
//
//   node scripts/test-range.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const WASM = "circuits/build/rangeDisclosure_js/rangeDisclosure.wasm";
const ZKEY = "circuits/build/rangeDisclosure_final.zkey";

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);

const amount = 500n, pubKey = 111222333n, blinding = 999888777n;
const commitment = H3(amount, pubKey, blinding);
const ctx = "424242";
const input = (amt, lo, hi, commit = null) => ({
  commitment: (commit ?? H3(amt, pubKey, blinding)).toString(),
  lower: lo.toString(), upper: hi.toString(), auditContextHash: ctx,
  amount: amt.toString(), pubKey: pubKey.toString(), blinding: blinding.toString(),
});

console.log("Two-sided range disclosure soundness\n");

// 1) amount (500) inside [100, 1000]: proves + verifies, amount NOT revealed
await (async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input(amount, 100n, 1000n), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    const leaks = publicSignals.includes(amount.toString());
    // public = [commitment, lower, upper, auditContextHash]
    if (verified && !leaks && publicSignals[1] === "100" && publicSignals[2] === "1000") ok("in band (100 ≤ 500 ≤ 1000) proves + verifies, exact amount NOT in public signals");
    else bad("in band", `verified=${verified} leaks=${leaks}`);
  } catch (e) { bad("in band", e.message.split("\n")[0]); }
})();

// 2) boundaries inclusive (amount == lower, amount == upper)
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(amount, 500n, 900n), WASM, ZKEY); // amount == lower
    await snarkjs.groth16.fullProve(input(amount, 100n, 500n), WASM, ZKEY); // amount == upper
    ok("band boundaries are inclusive (amount == lower and amount == upper both prove)");
  } catch (e) { bad("boundaries inclusive", e.message.split("\n")[0]); }
})();

// 3) below the band (amount < lower) is unprovable
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(amount, 600n, 1000n), WASM, ZKEY); // 500 < 600
    bad("below band rejected", "a proof was generated for amount < lower");
  } catch { ok("below the band (500 < 600) is UNPROVABLE"); }
})();

// 4) above the band (amount > upper) is unprovable
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(amount, 100n, 400n), WASM, ZKEY); // 500 > 400
    bad("above band rejected", "a proof was generated for amount > upper");
  } catch { ok("above the band (500 > 400) is UNPROVABLE"); }
})();

// 5) wrong commitment (claim an amount that doesn't open the commitment) is unprovable
await (async () => {
  try {
    await snarkjs.groth16.fullProve(input(300n, 100n, 1000n, commitment), WASM, ZKEY);
    bad("commitment binding", "proof generated for an amount that doesn't open the commitment");
  } catch { ok("a claimed amount that doesn't open the commitment is UNPROVABLE (binding holds)"); }
})();

console.log(`\n=== ${pass}/${pass + fail} range-disclosure checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

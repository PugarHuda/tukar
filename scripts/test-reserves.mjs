// Soundness self-check for the proof-of-reserves circuit: prove the SUM of the pool's
// note openings EQUALS a public declared-liabilities figure WITHOUT revealing any amount,
// with fixed-width padding (unused slots open to 0 with commitment Poseidon(0,0,0)).
//
//   node scripts/test-reserves.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const WASM = "circuits/build/reserves_js/reserves.wasm";
const ZKEY = "circuits/build/reserves_final.zkey";
const N = 32;

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const PAD = H3(0n, 0n, 0n); // padding commitment: Poseidon(0,0,0)

const pk = (i) => 100n + BigInt(i);
const bl = (i) => 9000n + BigInt(i);

// Build a full N-slot input from `amts` (real leaves); remaining slots are padding.
const build = (amts, declared, { badOpenIdx = -1 } = {}) => {
  const commitments = [], amounts = [], pubKeys = [], blindings = [];
  for (let i = 0; i < N; i++) {
    if (i < amts.length) {
      amounts.push(amts[i]); pubKeys.push(pk(i)); blindings.push(bl(i));
      const realAmt = badOpenIdx === i ? amts[i] + 1000n : amts[i];
      commitments.push(H3(realAmt, pk(i), bl(i)));
    } else {
      amounts.push(0n); pubKeys.push(0n); blindings.push(0n); commitments.push(PAD);
    }
  }
  return {
    commitments: commitments.map(String), declaredLiabilities: declared.toString(),
    amounts: amounts.map(String), pubKeys: pubKeys.map(String), blindings: blindings.map(String),
  };
};

const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);
console.log("Proof-of-reserves circuit soundness (N=" + N + ")\n");

// 1) honest attest: sum of 3 leaves == declared, no amount leaks, verifies
await (async () => {
  try {
    const amts = [500n, 300n, 150n];
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(build(amts, 950n), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    const leaks = amts.some((a) => publicSignals.includes(a.toString()));
    if (verified && !leaks) ok("sum(500,300,150)==950 proves + verifies, no amount leaks");
    else bad("honest attest", `verified=${verified} leaks=${leaks}`);
  } catch (e) { bad("honest attest", e.message.split("\n")[0]); }
})();

// 2) padding-only pool (0 real leaves) declares 0
await (async () => {
  try { await snarkjs.groth16.fullProve(build([], 0n), WASM, ZKEY); ok("empty pool: declared 0 proves (all padding, sum 0)"); }
  catch (e) { bad("empty pool", e.message.split("\n")[0]); }
})();

// 3) understating liabilities is UNPROVABLE (declared != true sum)
await (async () => {
  try { await snarkjs.groth16.fullProve(build([500n, 300n, 150n], 900n), WASM, ZKEY); bad("understate", "a proof was generated for declared < true sum"); }
  catch { ok("declaring less than the true sum (900 != 950) is UNPROVABLE"); }
})();

// 4) overstating liabilities is UNPROVABLE too (equality, not <=)
await (async () => {
  try { await snarkjs.groth16.fullProve(build([500n, 300n, 150n], 1000n), WASM, ZKEY); bad("overstate", "a proof was generated for declared > true sum"); }
  catch { ok("declaring more than the true sum (1000 != 950) is UNPROVABLE"); }
})();

// 5) a slot whose amount doesn't open its commitment is UNPROVABLE (binding holds)
await (async () => {
  try { await snarkjs.groth16.fullProve(build([500n, 300n, 150n], 950n, { badOpenIdx: 1 }), WASM, ZKEY); bad("binding", "proof for a non-opening amount"); }
  catch { ok("an amount that doesn't open its commitment is UNPROVABLE (binding holds)"); }
})();

// 6) full-width (32 real leaves) attest at the boundary
await (async () => {
  try {
    const amts = Array.from({ length: N }, (_, i) => BigInt(i + 1)); // 1..32, sum = 528
    await snarkjs.groth16.fullProve(build(amts, 528n), WASM, ZKEY);
    ok("full-width 32-leaf attest (sum 528) proves");
  } catch (e) { bad("full-width", e.message.split("\n")[0]); }
})();

console.log(`\n=== ${pass}/${pass + fail} proof-of-reserves checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

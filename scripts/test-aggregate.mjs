// Soundness test for the COMPLETE variable-count aggregate disclosure circuit: prove the SUM
// of the ACTIVE payments is <= a cap WITHOUT revealing any amount, where the audit request
// (auditContextHash = Poseidon(ctxNonce, commitments, active)) PINS the required set — so a
// holder cannot cherry-pick (omit a payment) under a request issued for the full set.
//
//   node scripts/test-aggregate.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const WASM = "circuits/build/aggregateDisclosure_js/aggregateDisclosure.wasm";
const ZKEY = "circuits/build/aggregateDisclosure_final.zkey";
const N = 5;

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const H = (arr) => F.toObject(poseidon(arr)); // variable-arity (used with 2N+1 = 11 inputs)

const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);
const pk = [111n, 222n, 333n, 444n, 555n];
const bl = [9991n, 9992n, 9993n, 9994n, 9995n];
const ctxNonce = 424242n;

const slots = (amts, { badOpenIdx = -1 } = {}) => {
  const commitments = [], active = [], amounts = [];
  for (let i = 0; i < N; i++) {
    if (i < amts.length) {
      amounts.push(amts[i]); active.push(1n);
      const realAmt = badOpenIdx === i ? amts[i] + 1000n : amts[i];
      commitments.push(H3(realAmt, pk[i], bl[i]));
    } else { amounts.push(0n); active.push(0n); commitments.push(0n); }
  }
  return { commitments, active, amounts };
};
const ctxHash = (commitments, active) => H([ctxNonce, ...commitments, ...active]);

// `issuedFor` = the set the AUDIT REQUEST was issued for (defaults to the proven set).
const input = (amts, cap, { issuedFor = null, badOpenIdx = -1 } = {}) => {
  const s = slots(amts, { badOpenIdx });
  const issued = issuedFor || { commitments: s.commitments, active: s.active };
  return {
    commitments: s.commitments.map(String), active: s.active.map(String),
    cap: cap.toString(), auditContextHash: ctxHash(issued.commitments, issued.active).toString(),
    ctxNonce: ctxNonce.toString(),
    amounts: s.amounts.map(String), pubKeys: pk.map(String), blindings: bl.map(String),
  };
};

console.log("Complete aggregate (portfolio) disclosure soundness\n");

// 1) 3 active (950) <= cap 1000, audit request issued for exactly this set: proves; no leak
await (async () => {
  try {
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input([500n, 300n, 150n], 1000n), WASM, ZKEY);
    const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    const leaks = [500n, 300n, 150n].some((a) => publicSignals.includes(a.toString()));
    if (verified && !leaks) ok("complete 3-active (950 ≤ 1000) proves + verifies, no amount leaks");
    else bad("complete under cap", `verified=${verified} leaks=${leaks}`);
  } catch (e) { bad("complete under cap", e.message.split("\n")[0]); }
})();

// 2) COMPLETENESS: request issued for the FULL 3-payment set, holder tries to OMIT one
//    (prove with only 2 active) -> the recomputed audit hash differs -> UNPROVABLE
await (async () => {
  const full = slots([500n, 300n, 150n]);
  try {
    await snarkjs.groth16.fullProve(
      input([500n, 300n], 1000n, { issuedFor: { commitments: full.commitments, active: full.active } }),
      WASM, ZKEY,
    );
    bad("cherry-pick blocked", "a proof was generated omitting a required payment");
  } catch { ok("omitting a required payment under a full-set audit request is UNPROVABLE (completeness holds)"); }
})();

// 3) single-payment request (count varies 1..N), hash issued for that set
await (async () => {
  try { await snarkjs.groth16.fullProve(input([700n], 1000n), WASM, ZKEY); ok("1-active complete report (700 ≤ 1000) proves"); }
  catch (e) { bad("1 active", e.message.split("\n")[0]); }
})();

// 4) 5 active at the cap (inclusive boundary, full width)
await (async () => {
  try { await snarkjs.groth16.fullProve(input([100n, 200n, 300n, 200n, 200n], 1000n), WASM, ZKEY); ok("5-active at cap (1000 ≤ 1000) proves (boundary inclusive)"); }
  catch (e) { bad("5 active at cap", e.message.split("\n")[0]); }
})();

// 5) active total over the cap is unprovable
await (async () => {
  try { await snarkjs.groth16.fullProve(input([500n, 300n, 150n], 900n), WASM, ZKEY); bad("over cap", "proof for total > cap"); }
  catch { ok("active total over cap (950 > 900) is UNPROVABLE"); }
})();

// 6) an active slot whose amount doesn't open its commitment is unprovable
await (async () => {
  try { await snarkjs.groth16.fullProve(input([500n, 300n, 150n], 1000n, { badOpenIdx: 1 }), WASM, ZKEY); bad("binding", "proof for a non-opening amount"); }
  catch { ok("an active amount that doesn't open its commitment is UNPROVABLE (binding holds)"); }
})();

console.log(`\n=== ${pass}/${pass + fail} aggregate-disclosure checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

// Soundness test for the COMPLETE variable-count aggregate disclosure circuit: prove the SUM
// of the ACTIVE payments is <= a cap WITHOUT revealing any amount, where the audit request
// (auditContextHash = Poseidon(ctxNonce, commitments, active)) PINS the required set — so a
// holder cannot cherry-pick (omit a payment) under a request issued for the full set.
//
//   node scripts/test-aggregate.mjs
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import { pick, requireArtifacts, rejectedByCircuit } from "./_soundness.mjs";

// circuits/build/ is gitignored; frontend/circuit/* is committed, so this suite runs in CI too.
const WASM = pick("circuits/build/aggregateDisclosure_js/aggregateDisclosure.wasm", "frontend/circuit/aggregateDisclosure.wasm");
const ZKEY = pick("circuits/build/aggregateDisclosure_final.zkey", "frontend/circuit/aggregateDisclosure_final.zkey");
requireArtifacts(WASM, ZKEY);
const N = 5;

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log("  ✅ " + n); };
const bad = (n, e) => { fail++; console.log("  ❌ " + n + (e ? " — " + e : "")); };

// A negative case counts ONLY when circom refused the witness. Every other throw — a
// renamed artifact, a typo'd path, a bad import, a wrong-arity input — is a FAILURE: it
// never exercised the property the case is named after. Without this, deleting the zkey
// would turn every "UNPROVABLE" case below green.
const expectUnprovable = async (name, input, why) => {
  try {
    await snarkjs.groth16.fullProve(input, WASM, ZKEY);
    bad(name, "a proof was generated — the constraint did NOT bind");
  } catch (e) {
    if (rejectedByCircuit(e)) ok(why);
    else bad(name, `threw, but NOT from a circuit constraint — ${String(e.message).split("\n")[0]}`);
  }
};

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const H = (arr) => F.toObject(poseidon(arr)); // variable-arity (used with 2N+1 = 11 inputs)

const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);
const pk = [111n, 222n, 333n, 444n, 555n];
const bl = [9991n, 9992n, 9993n, 9994n, 9995n];
const ctxNonce = 424242n;

// `swapIdx`: slot i holds a DIFFERENT note (fresh blinding) that the holder can still open —
// used to tamper with one commitment while every opening constraint still passes, so the only
// thing left to reject the witness is the audit-context binding.
const slots = (amts, { badOpenIdx = -1, swapIdx = -1 } = {}) => {
  const commitments = [], active = [], amounts = [], blindings = [];
  for (let i = 0; i < N; i++) {
    const b = swapIdx === i ? bl[i] + 700000n : bl[i];
    blindings.push(b);
    if (i < amts.length) {
      amounts.push(amts[i]); active.push(1n);
      const realAmt = badOpenIdx === i ? amts[i] + 1000n : amts[i];
      commitments.push(H3(realAmt, pk[i], b));
    } else { amounts.push(0n); active.push(0n); commitments.push(0n); }
  }
  return { commitments, active, amounts, blindings };
};
const ctxHash = (commitments, active, nonce = ctxNonce) => H([nonce, ...commitments, ...active]);

// `issuedFor`    = the set the AUDIT REQUEST was issued for (defaults to the proven set).
// `nonceClaimed` = the ctxNonce the PROVER puts on the wire (defaults to the issued one).
// `flipActive`   = prove slot i as INACTIVE while the request had it active; the commitments
//                  array is left untouched, so only the `active` vector differs.
const input = (amts, cap, { issuedFor = null, badOpenIdx = -1, swapIdx = -1, nonceClaimed = null, flipActive = -1 } = {}) => {
  const s = slots(amts, { badOpenIdx, swapIdx });
  const issued = issuedFor || { commitments: s.commitments, active: s.active };
  const provenActive = s.active.slice();
  const provenAmounts = s.amounts.slice();
  if (flipActive >= 0) { provenActive[flipActive] = 0n; provenAmounts[flipActive] = 0n; }
  return {
    commitments: s.commitments.map(String), active: provenActive.map(String),
    cap: cap.toString(), auditContextHash: ctxHash(issued.commitments, issued.active).toString(),
    ctxNonce: (nonceClaimed ?? ctxNonce).toString(),
    amounts: provenAmounts.map(String), pubKeys: pk.map(String), blindings: s.blindings.map(String),
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

// The set an audit request is issued for, reused by every completeness case below.
const REQUIRED = slots([500n, 300n, 150n]);
const issuedFor = { commitments: REQUIRED.commitments, active: REQUIRED.active };

// 2) COMPLETENESS: request issued for the FULL 3-payment set, holder tries to OMIT one
//    (prove with only 2 active) -> the recomputed audit hash differs -> UNPROVABLE
await expectUnprovable(
  "cherry-pick blocked",
  input([500n, 300n], 1000n, { issuedFor }),
  "omitting a required payment under a full-set audit request is UNPROVABLE (completeness holds)",
);

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
await expectUnprovable(
  "over cap", input([500n, 300n, 150n], 900n),
  "active total over cap (950 > 900) is UNPROVABLE",
);

// 6) an active slot whose amount doesn't open its commitment is unprovable
await expectUnprovable(
  "binding", input([500n, 300n, 150n], 1000n, { badOpenIdx: 1 }),
  "an active amount that doesn't open its commitment is UNPROVABLE (binding holds)",
);

// 7) TAMPERED COMMITMENT. The holder swaps one required note for a different note it CAN
//    open (fresh blinding, same amount), so every opening constraint still passes. The
//    substituted commitment is the ONLY thing that changed, and the audit-context binding
//    is what rejects it — a holder cannot answer a request with notes of its own choosing.
await expectUnprovable(
  "tampered commitment",
  input([500n, 300n, 150n], 1000n, { issuedFor, swapIdx: 1 }),
  "substituting a different (openable) note for a required one is UNPROVABLE (the set is pinned)",
);

// 8) WRONG ctxNonce. The nonce is the audit request's period/regulator id. Replaying last
//    period's report under this period's nonce (or a nonce of the holder's choosing) must
//    fail: the hash was issued over the OTHER nonce, so no witness exists.
await expectUnprovable(
  "wrong ctxNonce",
  input([500n, 300n, 150n], 1000n, { nonceClaimed: ctxNonce + 1n }),
  "claiming a different ctxNonce than the request was issued under is UNPROVABLE (no cross-period replay)",
);

// 9) WRONG `active` COUNT. The subtler cherry-pick: leave the commitments array byte-for-byte
//    as issued and only flip one active flag 1 -> 0, dropping 500 from the total. The set
//    still "looks" complete; the active vector is inside the audit hash, so it is rejected.
//    Under cap 500 the flipped report would otherwise pass the cap check (450 <= 500), which
//    is exactly the attack: the constraint that stops it can only be the context binding.
await expectUnprovable(
  "wrong active count",
  input([500n, 300n, 150n], 500n, { issuedFor, flipActive: 0 }),
  "flipping an active flag off while keeping the issued commitments is UNPROVABLE (the flags are bound too)",
);

// 9b) CONTROL for (9): the same flipped report, with the audit request HONESTLY issued for
//     the 2-payment set, does prove. Without this the case above could be passing on the
//     cap check rather than on the binding it names.
await (async () => {
  const two = slots([300n, 150n]);
  try {
    await snarkjs.groth16.fullProve(input([300n, 150n], 500n, { issuedFor: { commitments: two.commitments, active: two.active } }), WASM, ZKEY);
    ok("control: the same 450 ≤ 500 report DOES prove under a request issued for that set (case 9 fails on the binding, not the cap)");
  } catch (e) { bad("control for wrong active count", e.message.split("\n")[0]); }
})();

console.log(`\n=== ${pass}/${pass + fail} aggregate-disclosure checks passed ===`);
process.exit(fail === 0 ? 0 : 1);

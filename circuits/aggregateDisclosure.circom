pragma circom 2.1.6;

// Tukar — Aggregate (portfolio) Selective Disclosure circuit
// -----------------------------------------------------------------------------
// The compliance primitive real periodic reporting actually wants: prove that the
// SUM of N confidential payments over a period is at most a reporting cap, WITHOUT
// revealing any individual amount. This is the shape of a CTR / threshold report —
// "my total this quarter is under X" — done in zero-knowledge over the same note
// commitments the corridor already publishes.
//
//     commitment[i] = Poseidon(amount[i], pubKey[i], blinding[i])   (same as deposit)
//     proven fact  : amount[0] + ... + amount[N-1] <= cap           (each amount hidden)
//
// Public  inputs : commitments[N], cap, auditContextHash
// Private inputs : amounts[N], pubKeys[N], blindings[N]
// -----------------------------------------------------------------------------

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template AggregateDisclosure(N) {
    // ---- PUBLIC INPUTS ----
    signal input commitments[N];      // the N confidential commitments being aggregated
    signal input cap;                 // the reporting cap the total is tested against (public)
    signal input auditContextHash;    // binds proof to one audit request (period, regulator id)

    // ---- PRIVATE INPUTS (holder secrets) ----
    signal input amounts[N];
    signal input pubKeys[N];
    signal input blindings[N];

    // 1. Re-open every commitment from its secret preimage, so the aggregate is over the
    //    SAME amounts that are committed on-chain (no swapping in convenient values).
    component hasher[N];
    for (var i = 0; i < N; i++) {
        hasher[i] = Poseidon(3);
        hasher[i].inputs[0] <== amounts[i];
        hasher[i].inputs[1] <== pubKeys[i];
        hasher[i].inputs[2] <== blindings[i];
        commitments[i] === hasher[i].out;
    }

    // 2. Range-check each amount to 64 bits so the running sum can't wrap the field
    //    (N * 2^64 stays far below the BN254 modulus for any practical N).
    component ra[N];
    for (var i = 0; i < N; i++) {
        ra[i] = Num2Bits(64);
        ra[i].in <== amounts[i];
    }

    // 3. Accumulate the total.
    signal partial[N];
    partial[0] <== amounts[0];
    for (var i = 1; i < N; i++) {
        partial[i] <== partial[i - 1] + amounts[i];
    }

    // 4. Bound the cap too (72 bits comfortably holds a sum of N 64-bit amounts for N<=64),
    //    then prove total <= cap. A valid proof exists ONLY when the aggregate is under the
    //    cap, and it reveals nothing about the individual amounts beyond that fact.
    component capRange = Num2Bits(72);
    capRange.in <== cap;
    component le = LessEqThan(72);
    le.in[0] <== partial[N - 1];
    le.in[1] <== cap;
    le.out === 1;

    // 5. Bind the audit context so a report for one request can't be replayed for another.
    signal ctxSq;
    ctxSq <== auditContextHash * auditContextHash;
}

component main { public [ commitments, cap, auditContextHash ] } = AggregateDisclosure(3);

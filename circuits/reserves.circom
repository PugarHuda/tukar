pragma circom 2.1.6;

// Tukar — Proof-of-Reserves circuit — FIXED WIDTH N
// -----------------------------------------------------------------------------
// A REAL cryptographic proof-of-reserves for the corridor pool. Prove that the SUM
// of the openings of the pool's on-chain note commitments equals a PUBLIC declared
// liabilities figure, WITHOUT revealing any individual note amount. The reserves
// contract then binds these commitments to the pool's live leaf set and checks
// declared_liabilities <= on-chain custody (balance) — turning the operator's
// "reserves" panel from a display into a cryptographic solvency attestation.
//
//     commitment[i] = Poseidon(amount[i], pubKey[i], blinding[i])   (same as deposit)
//     proven fact  : sum over i of amount[i]  ==  declaredLiabilities  (each amount hidden)
//
// Fixed-width like the aggregate circuit: the tree can hold fewer than N leaves, so
// PADDING slots use the zero opening (amount=pubKey=blinding=0), whose commitment is
// the fixed constant Poseidon(0,0,0) and which contributes 0 to the sum. The reserves
// contract fills unused slots with that same constant, so the padding is bound too.
//
// Public  inputs : commitments[N], declaredLiabilities
// Private inputs : amounts[N], pubKeys[N], blindings[N]
// -----------------------------------------------------------------------------

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

template Reserves(N) {
    // ---- PUBLIC INPUTS ----
    signal input commitments[N];          // the N slot commitments (pool leaves, padded with Poseidon(0,0,0))
    signal input declaredLiabilities;     // the total obligations the openings must sum to (public)

    // ---- PRIVATE INPUTS (operator's note openings) ----
    signal input amounts[N];
    signal input pubKeys[N];
    signal input blindings[N];

    component hasher[N];
    component ra[N];
    signal partial[N];

    for (var i = 0; i < N; i++) {
        // Re-open the commitment: every slot MUST match its opening. A real leaf opens to
        // its true amount; a padding slot opens to 0 (Poseidon(0,0,0) is the padding
        // commitment the contract inserts). Poseidon is collision-resistant, so the only
        // openings that satisfy this are the true note amounts — no inflating/deflating.
        hasher[i] = Poseidon(3);
        hasher[i].inputs[0] <== amounts[i];
        hasher[i].inputs[1] <== pubKeys[i];
        hasher[i].inputs[2] <== blindings[i];
        commitments[i] === hasher[i].out;

        // Range-check every amount to 64 bits (matches the deposit range) so the running
        // sum of N amounts can't wrap the field.
        ra[i] = Num2Bits(64);
        ra[i].in <== amounts[i];
    }

    // Accumulate the total of ALL slot amounts (padding slots add 0).
    partial[0] <== amounts[0];
    for (var i = 1; i < N; i++) {
        partial[i] <== partial[i - 1] + amounts[i];
    }

    // The proven total must EQUAL the public declared-liabilities figure, so the operator
    // cannot understate obligations: the contract then checks declaredLiabilities <= custody.
    declaredLiabilities === partial[N - 1];
}

component main { public [ commitments, declaredLiabilities ] } = Reserves(32);

pragma circom 2.1.6;

// Tukar — Compliance circuit (ASP membership + non-membership)
// -----------------------------------------------------------------------------
// Proves, at a corridor edge, that the source of funds is compliant — WITHOUT
// revealing which member it is:
//   * MEMBERSHIP: the source key is in the ASP allow-list (Merkle inclusion in
//     the allow-list tree, root public),
//   * NON-MEMBERSHIP: the source key is not any of the publicly known
//     sanctioned/deny-listed keys.
// Bound to a transfer so the compliance proof cannot be detached and reused.
//
// This is the direct on-chain realization of the Privacy Pools whitepaper's
// "association set" model (Buterin, Soleimani, et al.).
//
// Public  : aspRoot, denyList[nDeny], bindHash
// Private : sourceKey, pathElements[levels], leafIndex
// -----------------------------------------------------------------------------

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "./lib/merkleProof.circom";

template Compliance(levels, nDeny) {
    // ---- PUBLIC ----
    signal input aspRoot;            // allow-list Merkle root
    signal input denyList[nDeny];    // publicly known sanctioned keys
    signal input bindHash;           // binds this proof to a specific transfer

    // ---- PRIVATE ----
    signal input sourceKey;          // the funds' source key (kept secret)
    signal input pathElements[levels];
    signal input leafIndex;

    // MEMBERSHIP: sourceKey is in the allow-list tree -> root must equal aspRoot.
    component idxBits = Num2Bits(levels);
    idxBits.in <== leafIndex;

    component tree = MerkleProof(levels);
    tree.leaf <== sourceKey;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== idxBits.out[i];
    }
    aspRoot === tree.root;

    // NON-MEMBERSHIP: sourceKey differs from every deny-listed key.
    component eq[nDeny];
    for (var j = 0; j < nDeny; j++) {
        eq[j] = IsEqual();
        eq[j].in[0] <== sourceKey;
        eq[j].in[1] <== denyList[j];
        eq[j].out === 0;   // must NOT equal any sanctioned key
    }

    // bind to the transfer
    signal bindSq;
    bindSq <== bindHash * bindHash;
}

component main { public [ aspRoot, denyList, bindHash ] } = Compliance(10, 4);

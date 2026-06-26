#![cfg(test)]
extern crate std;
use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Vec,
};

// Stub verifier that accepts every proof — lets us unit-test the pool's own
// logic (binding, nullifier set, commitment tracking, token custody).
#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn verify(_e: Env, _p: Groth16Proof, _pi: Vec<Bn254Fr>) -> bool {
        true
    }
}

fn b32(env: &Env, k: u8) -> BytesN<32> {
    BytesN::from_array(env, &[k; 32])
}

// big-endian 32-byte encoding of a small integer (a valid BN254 field element).
fn b32_dec(env: &Env, n: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[31] = n;
    BytesN::from_array(env, &a)
}

// The on-chain Poseidon is bitwise-identical to circomlibjs poseidon([1,2]),
// so a contract-computed Merkle root equals the circuit/frontend root.
#[test]
fn poseidon_matches_circomlib() {
    let env = Env::default();
    let got = crate::poseidon::hash2(&env, &b32_dec(&env, 1), &b32_dec(&env, 2));
    // poseidon(1,2) = 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a
    let want = BytesN::from_array(
        &env,
        &[
            0x11, 0x5c, 0xc0, 0xf5, 0xe7, 0xd6, 0x90, 0x41, 0x3d, 0xf6, 0x4c, 0x6b, 0x96, 0x62,
            0xe9, 0xcf, 0x2a, 0x36, 0x17, 0xf2, 0x74, 0x32, 0x45, 0x51, 0x9e, 0x19, 0x60, 0x7a,
            0x44, 0x17, 0x18, 0x9a,
        ],
    );
    assert_eq!(got, want);
}

// Diagnostic: measure the on-chain cost of Poseidon. One hash fits the per-tx
// CPU budget; ten (a depth-10 insert) do not — hence the merkleUpdate SNARK.
#[test]
fn poseidon_cost_probe() {
    let env = Env::default();
    let a = b32_dec(&env, 1);
    env.cost_estimate().budget().reset_unlimited();
    let _ = crate::poseidon::hash2(&env, &a, &a);
    std::println!("[poseidon] ONE HASH cost:\n{:?}", env.cost_estimate().budget());
    let mut z = BytesN::from_array(&env, &[0u8; 32]);
    env.cost_estimate().budget().reset_unlimited();
    for _ in 0..10 {
        z = crate::poseidon::hash2(&env, &z, &z);
    }
    std::println!("[poseidon] TEN HASHES (depth-10 insert) cost:\n{:?}", env.cost_estimate().budget());
}

fn amt_bytes(env: &Env, amount: i128) -> BytesN<32> {
    let mut buf = [0u8; 32];
    let be = amount.to_be_bytes();
    for i in 0..16 {
        buf[16 + i] = be[i];
    }
    BytesN::from_array(env, &buf)
}

// Field-negative of `amount` (r - amount), BE — the publicAmount convention a
// real withdraw proof carries (value leaving the shielded set).
fn neg_amt_bytes(env: &Env, amount: i128) -> BytesN<32> {
    const FIELD_R: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58,
        0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00,
        0x00, 0x01,
    ];
    let amt = amt_bytes(env, amount).to_array();
    let mut out = [0u8; 32];
    let mut borrow: i16 = 0;
    let mut i = 31i32;
    while i >= 0 {
        let k = i as usize;
        let diff = FIELD_R[k] as i16 - amt[k] as i16 - borrow;
        if diff < 0 {
            out[k] = (diff + 256) as u8;
            borrow = 1;
        } else {
            out[k] = diff as u8;
            borrow = 0;
        }
        i -= 1;
    }
    BytesN::from_array(env, &out)
}

fn dummy_proof(env: &Env) -> Groth16Proof {
    Groth16Proof {
        a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
        b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128])),
        c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
    }
}

struct Ctx {
    pool: PoolClient<'static>,
    token: TokenClient<'static>,
    user: Address,
}

fn setup(env: &Env) -> Ctx {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let v = env.register(MockVerifier, ());
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = sac.address();
    StellarAssetClient::new(env, &token_addr).mint(&user, &1_000);

    let deny: Vec<BytesN<32>> = vec![env, b32(env, 91), b32(env, 92), b32(env, 93), b32(env, 94)];
    let id = env.register(
        Pool,
        (
            admin,
            token_addr.clone(),
            v.clone(),
            v.clone(),
            v.clone(),
            v.clone(), // update verifier
            b32(env, 0),   // initial_root
            b32(env, 100), // asp_root
            deny,
        ),
    );
    Ctx {
        pool: PoolClient::new(env, &id),
        token: TokenClient::new(env, &token_addr),
        user,
    }
}

#[test]
fn deposit_pulls_tokens_and_records_commitment() {
    let env = Env::default();
    let c = setup(&env);
    let commit = b32(&env, 1);
    assert_eq!(c.pool.deposit(&c.user, &300, &commit, &dummy_proof(&env), &dummy_proof(&env)), 0);
    assert_eq!(c.pool.balance(), 300); // tokens now custodied by the pool
    assert_eq!(c.token.balance(&c.user), 700);
    assert!(c.pool.is_commitment_known(&commit));
}

// A second deposit to the SAME commitment would lock tokens (it can never become a
// second spendable leaf), so it's rejected before any tokens move.
#[test]
#[should_panic(expected = "Error(Contract, #10)")] // DuplicateCommitment
fn deposit_rejects_duplicate_commitment() {
    let env = Env::default();
    let c = setup(&env);
    let commit = b32(&env, 1);
    c.pool.deposit(&c.user, &100, &commit, &dummy_proof(&env), &dummy_proof(&env));
    c.pool.deposit(&c.user, &100, &commit, &dummy_proof(&env), &dummy_proof(&env)); // dup -> #10
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")] // InvalidAmount
fn deposit_rejects_amount_over_64_bits() {
    let env = Env::default();
    let c = setup(&env);
    // 2^64 stroops can't fit the disclosure circuit's 64-bit range — rejected early.
    c.pool.deposit(&c.user, &(1i128 << 64), &b32(&env, 1), &dummy_proof(&env), &dummy_proof(&env));
}

#[test]
fn withdraw_releases_bound_amount() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.deposit(&c.user, &300, &b32(&env, 1), &dummy_proof(&env), &dummy_proof(&env));

    let recipient = Address::generate(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    // public_amount must equal the field-negative of the released amount (binding)
    c.pool.withdraw(
        &dummy_proof(&env), &b32(&env, 0), &neg_amt_bytes(&env, 120),
        &nulls, &outs, &recipient, &120,
    );
    assert_eq!(c.token.balance(&recipient), 120);
    assert_eq!(c.pool.balance(), 180);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")] // AmountNotBound
fn withdraw_amount_must_match_public_amount() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.deposit(&c.user, &300, &b32(&env, 1), &dummy_proof(&env), &dummy_proof(&env));
    let recipient = Address::generate(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    // public_amount binds to 50 but caller tries to release 120 -> rejected
    c.pool.withdraw(
        &dummy_proof(&env), &b32(&env, 0), &neg_amt_bytes(&env, 50),
        &nulls, &outs, &recipient, &120,
    );
}

#[test]
fn transfer_spends_nullifiers_and_records_outputs() {
    let env = Env::default();
    let c = setup(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    c.pool.transfer(&dummy_proof(&env), &b32(&env, 0), &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
    assert!(c.pool.is_nullifier_used(&b32(&env, 10)));
    assert!(c.pool.is_commitment_known(&b32(&env, 20)));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // NullifierUsed
fn transfer_double_spend_rejected() {
    let env = Env::default();
    let c = setup(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    c.pool.transfer(&dummy_proof(&env), &b32(&env, 0), &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
    c.pool.transfer(&dummy_proof(&env), &b32(&env, 0), &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // UnknownRoot
fn transfer_unknown_root_rejected() {
    let env = Env::default();
    let c = setup(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    c.pool.transfer(&dummy_proof(&env), &b32(&env, 250), &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
}

// A pure shielded transfer must move zero external value. A positive public_amount
// with zero-value dummy inputs would otherwise MINT a backed commitment from nothing
// (the circuit only enforces sumIn + publicAmount == sumOut, and dummy inputs skip
// the Merkle check). The contract must reject any non-zero public_amount on transfer.
#[test]
#[should_panic(expected = "Error(Contract, #6)")] // AmountNotBound
fn transfer_rejects_nonzero_public_amount() {
    let env = Env::default();
    let c = setup(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    // root 0 is the known genesis; public_amount = 5 (non-zero) must be rejected.
    c.pool.transfer(&dummy_proof(&env), &b32(&env, 0), &b32(&env, 5), &b32(&env, 5), &nulls, &outs);
}

#[test]
fn disclose_requires_known_commitment() {
    let env = Env::default();
    let c = setup(&env);
    let commit = b32(&env, 1);
    c.pool.deposit(&c.user, &100, &commit, &dummy_proof(&env), &dummy_proof(&env));
    assert!(c.pool.disclose(&dummy_proof(&env), &commit, &b32(&env, 50), &b32(&env, 42)));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // UnknownCommitment
fn disclose_unknown_commitment_rejected() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.disclose(&dummy_proof(&env), &b32(&env, 200), &b32(&env, 50), &b32(&env, 42));
}

#[test]
fn register_root_verified_advances_from_known_root() {
    let env = Env::default();
    let c = setup(&env);
    let old = b32(&env, 0); // known initial root
    let leaf = b32(&env, 42);
    let newr = b32(&env, 77);
    assert!(!c.pool.is_root_known(&newr));
    // The leaf must be a backed commitment first (a real deposit moved tokens in).
    c.pool.deposit(&c.user, &10, &leaf, &dummy_proof(&env), &dummy_proof(&env));
    c.pool.register_root_verified(&dummy_proof(&env), &old, &leaf, &newr);
    assert!(c.pool.is_root_known(&newr));
    assert_eq!(c.pool.current_root(), newr);
    assert!(c.pool.is_commitment_known(&leaf));
}

// THE DRAIN DEFENSE: a leaf that was never deposited cannot be inserted into the
// spendable tree — so an attacker can't mint a note out of thin air and withdraw
// against it. Without this gate `register_root_verified` would accept any leaf.
#[test]
#[should_panic(expected = "Error(Contract, #3)")] // UnknownCommitment
fn register_root_verified_rejects_undeposited_leaf() {
    let env = Env::default();
    let c = setup(&env);
    let old = b32(&env, 0);
    // leaf 200 was never deposited (no tokens backing it) -> rejected.
    c.pool.register_root_verified(&dummy_proof(&env), &old, &b32(&env, 200), &b32(&env, 77));
}

// Insert-once: the SAME backed commitment cannot be inserted twice (a second
// spendable leaf with a different nullifier would double the deposit's value).
#[test]
#[should_panic(expected = "Error(Contract, #9)")] // LeafAlreadyInserted
fn register_root_verified_rejects_double_insert() {
    let env = Env::default();
    let c = setup(&env);
    let leaf = b32(&env, 42);
    c.pool.deposit(&c.user, &10, &leaf, &dummy_proof(&env), &dummy_proof(&env));
    let g = c.pool.current_root();
    c.pool.register_root_verified(&dummy_proof(&env), &g, &leaf, &b32(&env, 77));
    // try to insert the very same commitment again from the new current root
    let r1 = c.pool.current_root();
    c.pool.register_root_verified(&dummy_proof(&env), &r1, &leaf, &b32(&env, 88));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // UnknownRoot
fn register_root_verified_rejects_unknown_old_root() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.register_root_verified(&dummy_proof(&env), &b32(&env, 250), &b32(&env, 42), &b32(&env, 77));
}

// Accumulator semantics: an insert must build on the CURRENT root. Inserting from
// a now-stale (formerly-current) root is rejected, so the tree is a single global
// accumulator and its reconstructed root always equals current_root.
#[test]
#[should_panic(expected = "Error(Contract, #1)")] // UnknownRoot
fn register_root_verified_rejects_stale_root() {
    let env = Env::default();
    let c = setup(&env);
    let genesis = c.pool.current_root();
    c.pool.deposit(&c.user, &10, &b32(&env, 42), &dummy_proof(&env), &dummy_proof(&env));
    c.pool.register_root_verified(&dummy_proof(&env), &genesis, &b32(&env, 42), &b32(&env, 77));
    // current_root is now 77; inserting again from the stale genesis must fail
    // (this fails on the stale root before the leaf-backing check is reached).
    c.pool.register_root_verified(&dummy_proof(&env), &genesis, &b32(&env, 43), &b32(&env, 88));
}

// Leaves are stored on-chain in order, so a client can reconstruct the exact tree
// from contract state (leaves()) without relying on event retention.
#[test]
fn register_root_verified_stores_ordered_leaves() {
    let env = Env::default();
    let c = setup(&env);
    assert_eq!(c.pool.leaf_count(), 0);
    let g = c.pool.current_root();
    let l0 = b32(&env, 42);
    let l1 = b32(&env, 43);
    c.pool.deposit(&c.user, &10, &l0, &dummy_proof(&env), &dummy_proof(&env));
    c.pool.deposit(&c.user, &10, &l1, &dummy_proof(&env), &dummy_proof(&env));
    c.pool.register_root_verified(&dummy_proof(&env), &g, &l0, &b32(&env, 77));
    let r1 = c.pool.current_root(); // accumulator: next insert builds on this
    c.pool.register_root_verified(&dummy_proof(&env), &r1, &l1, &b32(&env, 88));
    assert_eq!(c.pool.leaf_count(), 2);
    let ls = c.pool.leaves();
    assert_eq!(ls.len(), 2);
    assert_eq!(ls.get(0).unwrap(), l0);
    assert_eq!(ls.get(1).unwrap(), l1);
}

// leaf_range returns bounded chunks (for reconstructing large trees) and clamps.
#[test]
fn leaf_range_paginates_and_clamps() {
    let env = Env::default();
    let c = setup(&env);
    let mut cur = c.pool.current_root();
    let mut k = 0u8;
    while k < 3 {
        let leaf = b32(&env, 50 + k);
        let nr = b32(&env, 70 + k);
        c.pool.deposit(&c.user, &10, &leaf, &dummy_proof(&env), &dummy_proof(&env));
        c.pool.register_root_verified(&dummy_proof(&env), &cur, &leaf, &nr);
        cur = nr;
        k += 1;
    }
    assert_eq!(c.pool.leaf_count(), 3);
    let mid = c.pool.leaf_range(&1, &1);
    assert_eq!(mid.len(), 1);
    assert_eq!(mid.get(0).unwrap(), b32(&env, 51));
    let tail = c.pool.leaf_range(&2, &99); // count past the end is clamped
    assert_eq!(tail.len(), 1);
    assert_eq!(tail.get(0).unwrap(), b32(&env, 52));
}

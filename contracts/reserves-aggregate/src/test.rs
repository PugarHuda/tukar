#![cfg(test)]
extern crate std;
use super::*;
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::Address as _,
    vec, Address, BytesN, Env, Vec,
};

// Stand-in for the live corridor pool: a configurable custody balance and a known-commitment
// set. The REAL pool exposes the identical `balance()` / `is_commitment_known()` /
// `leaf_count()` the reserves-aggregate contract reads cross-contract.
#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn __constructor(env: Env, balance: i128, leaves: Vec<BytesN<32>>) {
        env.storage().instance().set(&symbol_short!("bal"), &balance);
        env.storage().instance().set(&symbol_short!("lv"), &leaves);
    }
    pub fn balance(env: Env) -> i128 {
        env.storage().instance().get(&symbol_short!("bal")).unwrap()
    }
    pub fn leaf_count(env: Env) -> u32 {
        let lv: Vec<BytesN<32>> = env.storage().instance().get(&symbol_short!("lv")).unwrap();
        lv.len()
    }
    pub fn is_commitment_known(env: Env, commitment: BytesN<32>) -> bool {
        let lv: Vec<BytesN<32>> = env.storage().instance().get(&symbol_short!("lv")).unwrap();
        lv.iter().any(|c| c == commitment)
    }
}

// Verifier stub returning a configured bool. The real aggregate verifier is exercised on-chain
// in the e2e; here we only need the accept/reject path for accumulation + guard logic.
#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn __constructor(env: Env, accept: bool) {
        env.storage().instance().set(&symbol_short!("ok"), &accept);
    }
    pub fn verify(env: Env, _p: soroban_sdk::Val, _pi: Vec<Bn254Fr>) -> bool {
        env.storage().instance().get(&symbol_short!("ok")).unwrap()
    }
}

fn b32(env: &Env, x: u8) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[31] = x;
    BytesN::from_array(env, &a)
}

fn dummy_proof(env: &Env) -> Groth16Proof {
    Groth16Proof {
        a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
        b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128])),
        c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
    }
}

// A 5-wide slot set: `ids` are the ACTIVE commitments (padded to 5 with inactive zero slots).
fn slots(env: &Env, ids: &[u8]) -> (Vec<BytesN<32>>, Vec<u32>) {
    let mut commitments = vec![env];
    let mut active = vec![env];
    for i in 0..5u32 {
        if (i as usize) < ids.len() {
            commitments.push_back(b32(env, ids[i as usize]));
            active.push_back(1u32);
        } else {
            commitments.push_back(BytesN::from_array(env, &[0u8; 32])); // inactive padding
            active.push_back(0u32);
        }
    }
    (commitments, active)
}

struct Ctx {
    c: ReservesAggregateClient<'static>,
    admin: Address,
}

// `pool_leaves` = the commitments the mock pool reports as known deposits.
fn setup(env: &Env, balance: i128, pool_leaves: &[u8], accept: bool) -> Ctx {
    env.mock_all_auths();
    let mut leaves = vec![env];
    for &id in pool_leaves {
        leaves.push_back(b32(env, id));
    }
    let admin = Address::generate(env);
    let pool = env.register(MockPool, (balance, leaves));
    let verifier = env.register(MockVerifier, (accept,));
    let id = env.register(ReservesAggregate, (admin.clone(), pool, verifier));
    Ctx { c: ReservesAggregateClient::new(env, &id), admin }
}

fn nonce(env: &Env) -> BytesN<32> {
    b32(env, 42)
}
fn audit(env: &Env) -> BytesN<32> {
    // Proof-bound in production; the mock verifier ignores it, so any canonical value works.
    b32(env, 99)
}

#[test]
fn constructor_and_open_round() {
    let env = Env::default();
    let ctx = setup(&env, 1000, &[1, 2, 3], true);
    assert_eq!(ctx.c.round(), 0);
    assert_eq!(ctx.c.ctx_nonce(), None);
    assert_eq!(ctx.c.admin(), ctx.admin);
    let r = ctx.c.open_round(&nonce(&env));
    assert_eq!(r, 1);
    assert_eq!(ctx.c.round(), 1);
    assert_eq!(ctx.c.ctx_nonce(), Some(nonce(&env)));
    assert_eq!(ctx.c.proven_liabilities(), 0);
    assert_eq!(ctx.c.covered_count(), 0);
    assert_eq!(ctx.c.pool_leaf_count(), 3);
    assert_eq!(ctx.c.pool_balance(), 1000);
}

#[test]
fn accumulates_across_two_partials() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1, 2, 3, 4], true);
    ctx.c.open_round(&nonce(&env));

    // Depositor A: 2 notes (commitments 1,2), attests they total <= 500.
    let (cm_a, ac_a) = slots(&env, &[1, 2]);
    let t1 = ctx.c.attest_partial(&dummy_proof(&env), &cm_a, &ac_a, &500i128, &audit(&env));
    assert_eq!(t1, 500);
    assert_eq!(ctx.c.proven_liabilities(), 500);
    assert_eq!(ctx.c.covered_count(), 2);

    // Depositor B: 1 note (commitment 3), attests <= 300. Running total grows.
    let (cm_b, ac_b) = slots(&env, &[3]);
    let t2 = ctx.c.attest_partial(&dummy_proof(&env), &cm_b, &ac_b, &300i128, &audit(&env));
    assert_eq!(t2, 800);
    assert_eq!(ctx.c.proven_liabilities(), 800);
    assert_eq!(ctx.c.covered_count(), 3);
    assert!(ctx.c.solvent_for_covered()); // 800 <= 10_000
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // AlreadyCovered
fn rejects_double_count_replay() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1, 2, 3], true);
    ctx.c.open_round(&nonce(&env));
    let (cm, ac) = slots(&env, &[1, 2]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &500i128, &audit(&env));
    // Replaying an already-covered commitment (1) in the same round must be rejected.
    let (cm2, ac2) = slots(&env, &[1]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm2, &ac2, &200i128, &audit(&env));
}

#[test]
fn new_round_clears_covered_set() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1, 2], true);
    ctx.c.open_round(&nonce(&env));
    let (cm, ac) = slots(&env, &[1]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &500i128, &audit(&env));
    assert_eq!(ctx.c.proven_liabilities(), 500);
    // A fresh round resets the total/count and lets the same commitment be covered again.
    ctx.c.open_round(&b32(&env, 43));
    assert_eq!(ctx.c.round(), 2);
    assert_eq!(ctx.c.proven_liabilities(), 0);
    assert_eq!(ctx.c.covered_count(), 0);
    let t = ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &500i128, &audit(&env));
    assert_eq!(t, 500);
}

#[test]
fn solvent_and_insolvent_views() {
    let env = Env::default();
    // balance 400, attest 500 covered -> insolvent-for-covered.
    let ctx = setup(&env, 400, &[1, 2], true);
    ctx.c.open_round(&nonce(&env));
    let (cm, ac) = slots(&env, &[1, 2]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &500i128, &audit(&env));
    assert_eq!(ctx.c.proven_liabilities(), 500);
    assert!(!ctx.c.solvent_for_covered()); // 500 > 400
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // UnknownCommitment
fn rejects_unknown_commitment() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1, 2], true); // pool knows only 1,2
    ctx.c.open_round(&nonce(&env));
    let (cm, ac) = slots(&env, &[9]); // 9 is not a pool deposit
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &100i128, &audit(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // ProofRejected
fn rejects_bad_proof() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1, 2], false); // verifier rejects
    ctx.c.open_round(&nonce(&env));
    let (cm, ac) = slots(&env, &[1]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &100i128, &audit(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // NotOpen
fn attest_before_open_fails() {
    let env = Env::default();
    let ctx = setup(&env, 10_000, &[1], true);
    let (cm, ac) = slots(&env, &[1]);
    ctx.c.attest_partial(&dummy_proof(&env), &cm, &ac, &100i128, &audit(&env));
}

#[test]
fn unauthorized_open_round_fails() {
    // No mock_all_auths: admin.require_auth() has no matching auth -> the call errors.
    let env = Env::default();
    let admin = Address::generate(&env);
    let pool = env.register(MockPool, (1000i128, Vec::<BytesN<32>>::new(&env)));
    let verifier = env.register(MockVerifier, (true,));
    let id = env.register(ReservesAggregate, (admin, pool, verifier));
    let c = ReservesAggregateClient::new(&env, &id);
    assert!(c.try_open_round(&nonce(&env)).is_err());
}

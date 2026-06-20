#![cfg(test)]
use super::*;
use soroban_sdk::{
    contract, contractimpl, testutils::Address as _, vec, Address, BytesN, Env, Vec,
};

// A stub verifier that accepts every proof — lets us unit-test the pool's own
// logic (binding, nullifier set, commitment tracking) without real proofs.
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

fn dummy_proof(env: &Env) -> Groth16Proof {
    Groth16Proof {
        a: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
        b: Bn254G2Affine::from_bytes(BytesN::from_array(env, &[0u8; 128])),
        c: Bn254G1Affine::from_bytes(BytesN::from_array(env, &[0u8; 64])),
    }
}

fn setup(env: &Env) -> PoolClient {
    let admin = Address::generate(env);
    let v = env.register(MockVerifier, ());
    let root0 = b32(env, 0);
    let asp_root = b32(env, 100);
    let deny: Vec<BytesN<32>> = vec![env, b32(env, 91), b32(env, 92), b32(env, 93), b32(env, 94)];
    let id = env.register(
        Pool,
        (admin, v.clone(), v.clone(), v.clone(), root0, asp_root, deny),
    );
    PoolClient::new(env, &id)
}

#[test]
fn deposit_records_commitment() {
    let env = Env::default();
    let pool = setup(&env);
    let c = b32(&env, 1);
    assert_eq!(pool.commitment_count(), 0);
    assert_eq!(pool.deposit(&c, &dummy_proof(&env)), 0);
    assert!(pool.is_commitment_known(&c));
    assert_eq!(pool.commitment_count(), 1);
}

#[test]
fn register_root_marks_known_and_current() {
    let env = Env::default();
    env.mock_all_auths();
    let pool = setup(&env);
    let root1 = b32(&env, 7);
    assert!(pool.is_root_known(&b32(&env, 0))); // initial root
    assert!(!pool.is_root_known(&root1));
    pool.register_root(&root1);
    assert!(pool.is_root_known(&root1));
    assert_eq!(pool.current_root(), root1);
}

#[test]
#[should_panic]
fn register_root_requires_admin_auth() {
    let env = Env::default();
    let pool = setup(&env);
    pool.register_root(&b32(&env, 7));
}

#[test]
fn transfer_spends_nullifiers_and_records_outputs() {
    let env = Env::default();
    let pool = setup(&env);
    let root = b32(&env, 0); // initial known root
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];

    assert!(!pool.is_nullifier_used(&b32(&env, 10)));
    pool.transfer(&dummy_proof(&env), &root, &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
    assert!(pool.is_nullifier_used(&b32(&env, 10)));
    assert!(pool.is_nullifier_used(&b32(&env, 11)));
    assert!(pool.is_commitment_known(&b32(&env, 20)));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // NullifierUsed
fn transfer_double_spend_rejected() {
    let env = Env::default();
    let pool = setup(&env);
    let root = b32(&env, 0);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    pool.transfer(&dummy_proof(&env), &root, &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
    // replay -> NullifierUsed
    pool.transfer(&dummy_proof(&env), &root, &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // UnknownRoot
fn transfer_unknown_root_rejected() {
    let env = Env::default();
    let pool = setup(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    pool.transfer(&dummy_proof(&env), &b32(&env, 250), &b32(&env, 0), &b32(&env, 5), &nulls, &outs);
}

#[test]
fn disclose_requires_known_commitment() {
    let env = Env::default();
    let pool = setup(&env);
    let c = b32(&env, 1);
    pool.deposit(&c, &dummy_proof(&env));
    // known commitment -> ok
    assert!(pool.disclose(&dummy_proof(&env), &c, &b32(&env, 50), &b32(&env, 42)));
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // UnknownCommitment
fn disclose_unknown_commitment_rejected() {
    let env = Env::default();
    let pool = setup(&env);
    pool.disclose(&dummy_proof(&env), &b32(&env, 200), &b32(&env, 50), &b32(&env, 42));
}

#![cfg(test)]
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

fn amt_bytes(env: &Env, amount: i128) -> BytesN<32> {
    let mut buf = [0u8; 32];
    let be = amount.to_be_bytes();
    for i in 0..16 {
        buf[16 + i] = be[i];
    }
    BytesN::from_array(env, &buf)
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

#[test]
fn withdraw_releases_bound_amount() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.deposit(&c.user, &300, &b32(&env, 1), &dummy_proof(&env), &dummy_proof(&env));

    let recipient = Address::generate(&env);
    let nulls: Vec<BytesN<32>> = vec![&env, b32(&env, 10), b32(&env, 11)];
    let outs: Vec<BytesN<32>> = vec![&env, b32(&env, 20), b32(&env, 21)];
    // public_amount must equal the released amount (binding)
    c.pool.withdraw(
        &dummy_proof(&env), &b32(&env, 0), &amt_bytes(&env, 120), &b32(&env, 5),
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
    // public_amount says 50 but caller tries to release 120 -> rejected
    c.pool.withdraw(
        &dummy_proof(&env), &b32(&env, 0), &amt_bytes(&env, 50), &b32(&env, 5),
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
    c.pool.register_root_verified(&dummy_proof(&env), &old, &leaf, &newr);
    assert!(c.pool.is_root_known(&newr));
    assert_eq!(c.pool.current_root(), newr);
    assert!(c.pool.is_commitment_known(&leaf));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // UnknownRoot
fn register_root_verified_rejects_unknown_old_root() {
    let env = Env::default();
    let c = setup(&env);
    c.pool.register_root_verified(&dummy_proof(&env), &b32(&env, 250), &b32(&env, 42), &b32(&env, 77));
}

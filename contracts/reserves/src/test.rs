#![cfg(test)]
extern crate std;
use super::*;
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::Address as _,
    vec, Address, BytesN, Env, Vec,
};

// Stand-in for the corridor pool: returns a configurable custody balance and leaf set,
// so the reserves contract's cross-contract reads + binding can be exercised without the
// full deposit machinery. The REAL pool exposes the identical `balance()` / `leaves()`.
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
    pub fn leaves(env: Env) -> Vec<BytesN<32>> {
        env.storage().instance().get(&symbol_short!("lv")).unwrap()
    }
}

// Verifier stub that returns a configured bool AND records the public-input vector it was
// handed, so a test can assert the reserves contract built exactly [commitments(32),
// declared] in order (the binding-discipline claim).
#[contract]
pub struct MockVerifier;

#[contractimpl]
impl MockVerifier {
    pub fn __constructor(env: Env, accept: bool) {
        env.storage().instance().set(&symbol_short!("ok"), &accept);
    }
    pub fn verify(env: Env, _p: soroban_sdk::Val, pi: Vec<Bn254Fr>) -> bool {
        let mut bytes: Vec<BytesN<32>> = vec![&env];
        for x in pi.iter() {
            bytes.push_back(x.to_bytes());
        }
        env.storage().instance().set(&symbol_short!("PI"), &bytes);
        env.storage().instance().get(&symbol_short!("ok")).unwrap()
    }
    pub fn captured(env: Env) -> Vec<BytesN<32>> {
        env.storage().instance().get(&symbol_short!("PI")).unwrap()
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

struct Ctx {
    reserves: ReservesClient<'static>,
    verifier: Address,
}

fn setup(env: &Env, balance: i128, leaf_ids: &[u8], accept: bool) -> Ctx {
    env.mock_all_auths();
    let mut leaves = vec![env];
    for &id in leaf_ids {
        leaves.push_back(b32(env, id));
    }
    let admin = Address::generate(env);
    let pool = env.register(MockPool, (balance, leaves));
    let verifier = env.register(MockVerifier, (accept,));
    let id = env.register(Reserves, (admin, pool, verifier.clone()));
    Ctx {
        reserves: ReservesClient::new(env, &id),
        verifier,
    }
}

#[test]
fn constructor_sets_state() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let pool = env.register(MockPool, (0i128, Vec::<BytesN<32>>::new(&env)));
    let verifier = env.register(MockVerifier, (true,));
    let id = env.register(Reserves, (admin.clone(), pool.clone(), verifier.clone()));
    let r = ReservesClient::new(&env, &id);
    assert_eq!(r.admin(), admin);
    assert_eq!(r.pool(), pool);
    assert_eq!(r.verifier(), verifier);
    assert_eq!(r.latest_attestation(), None);
    assert_eq!(r.is_solvent(), false);
}

#[test]
fn attest_records_solvent_and_binds_leaves() {
    let env = Env::default();
    let c = setup(&env, 1000, &[3, 7, 9], true);
    let att = c.reserves.attest(&dummy_proof(&env), &950i128);
    assert_eq!(att.liabilities, 950);
    assert_eq!(att.reserves, 1000);
    assert_eq!(c.reserves.latest_attestation(), Some(att));
    assert_eq!(c.reserves.is_solvent(), true);

    // Binding: the verifier saw exactly 33 public inputs = 32 commitments + declared,
    // built FROM the pool leaves (first 3) then padding, then the declared figure.
    let captured = MockVerifierClient::new(&env, &c.verifier).captured();
    assert_eq!(captured.len(), 33);
    assert_eq!(captured.get(0).unwrap(), b32(&env, 3));
    assert_eq!(captured.get(2).unwrap(), b32(&env, 9));
    assert_eq!(captured.get(3).unwrap(), BytesN::from_array(&env, &PAD));
    assert_eq!(captured.get(31).unwrap(), BytesN::from_array(&env, &PAD));
    let mut d = [0u8; 32];
    d[30] = (950u16 >> 8) as u8;
    d[31] = (950u16 & 0xff) as u8;
    assert_eq!(captured.get(32).unwrap(), BytesN::from_array(&env, &d));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")] // Insolvent
fn attest_insolvent_panics() {
    let env = Env::default();
    let c = setup(&env, 900, &[1, 2], true);
    c.reserves.attest(&dummy_proof(&env), &950i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")] // ProofRejected
fn attest_rejected_proof_panics() {
    let env = Env::default();
    let c = setup(&env, 1000, &[1, 2], false);
    c.reserves.attest(&dummy_proof(&env), &950i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")] // TooManyLeaves
fn attest_too_many_leaves_panics() {
    let env = Env::default();
    let ids: std::vec::Vec<u8> = (1..=33u8).collect();
    let c = setup(&env, 10_000, &ids, true);
    c.reserves.attest(&dummy_proof(&env), &1i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")] // InvalidAmount
fn attest_negative_liabilities_panics() {
    let env = Env::default();
    let c = setup(&env, 1000, &[1], true);
    c.reserves.attest(&dummy_proof(&env), &-1i128);
}

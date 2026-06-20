#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

fn setup(env: &Env) -> (PoolClient, Address) {
    let admin = Address::generate(env);
    let v = Address::generate(env);
    let root0 = BytesN::from_array(env, &[0u8; 32]);
    let id = env.register(
        Pool,
        (admin.clone(), v.clone(), v.clone(), v.clone(), root0.clone()),
    );
    (PoolClient::new(env, &id), admin)
}

#[test]
fn deposit_increments_count() {
    let env = Env::default();
    let (pool, _admin) = setup(&env);
    assert_eq!(pool.commitment_count(), 0);
    let c = BytesN::from_array(&env, &[1u8; 32]);
    assert_eq!(pool.deposit(&c), 0);
    assert_eq!(pool.deposit(&c), 1);
    assert_eq!(pool.commitment_count(), 2);
}

#[test]
fn register_root_marks_known_and_current() {
    let env = Env::default();
    env.mock_all_auths();
    let (pool, _admin) = setup(&env);

    let root0 = BytesN::from_array(&env, &[0u8; 32]);
    let root1 = BytesN::from_array(&env, &[7u8; 32]);

    assert!(pool.is_root_known(&root0)); // initial root
    assert!(!pool.is_root_known(&root1));

    pool.register_root(&root1);
    assert!(pool.is_root_known(&root1));
    assert_eq!(pool.current_root(), root1);
}

#[test]
#[should_panic]
fn register_root_requires_admin_auth() {
    let env = Env::default();
    // no mock_all_auths -> admin.require_auth() fails
    let (pool, _admin) = setup(&env);
    let root1 = BytesN::from_array(&env, &[7u8; 32]);
    pool.register_root(&root1);
}

#[test]
fn nullifier_unused_by_default() {
    let env = Env::default();
    let (pool, _admin) = setup(&env);
    let n = BytesN::from_array(&env, &[9u8; 32]);
    assert!(!pool.is_nullifier_used(&n));
}

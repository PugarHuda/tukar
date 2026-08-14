#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, Env, Symbol};

fn seed(env: &Env) -> (PolicyRegistryClient, Address) {
    let admin = Address::generate(env);
    let corridors = vec![env, Symbol::new(env, "MX"), Symbol::new(env, "BR")];
    let entries = vec![
        env,
        PolicyEntry { cap_usdc: 10000, disclosure: 1 }, // MX: threshold
        PolicyEntry { cap_usdc: 10000, disclosure: 2 }, // BR: range
    ];
    let id = env.register(PolicyRegistry, (admin.clone(), corridors, entries));
    (PolicyRegistryClient::new(env, &id), admin)
}

// Constructor seeds without an admin signature; the views return the seeded values.
#[test]
fn constructor_seeds_and_views_return_values() {
    let env = Env::default();
    let (c, admin) = seed(&env);

    assert_eq!(c.admin(), admin);
    assert_eq!(c.corridors(), vec![&env, Symbol::new(&env, "MX"), Symbol::new(&env, "BR")]);

    let mx = c.policy(&Symbol::new(&env, "MX")).unwrap();
    assert_eq!(mx.cap_usdc, 10000);
    assert_eq!(mx.disclosure, 1);
    let br = c.policy(&Symbol::new(&env, "BR")).unwrap();
    assert_eq!(br.disclosure, 2);
    // An unset corridor reads None.
    assert!(c.policy(&Symbol::new(&env, "ZZ")).is_none());
}

// set_policy upserts an existing corridor (no duplicate index entry) and appends a new one.
#[test]
fn set_policy_upserts_and_appends() {
    let env = Env::default();
    env.mock_all_auths();
    let (c, _admin) = seed(&env);

    // Upsert MX in place.
    c.set_policy(&Symbol::new(&env, "MX"), &5000, &0);
    let mx = c.policy(&Symbol::new(&env, "MX")).unwrap();
    assert_eq!(mx.cap_usdc, 5000);
    assert_eq!(mx.disclosure, 0);
    // Corridor list unchanged (still 2, no dup).
    assert_eq!(c.corridors().len(), 2);

    // A brand-new corridor is appended to the index.
    c.set_policy(&Symbol::new(&env, "PH"), &3000, &1);
    assert_eq!(c.corridors().len(), 3);
    assert_eq!(c.policy(&Symbol::new(&env, "PH")).unwrap().cap_usdc, 3000);
}

// set_policy requires the admin signature; an unauthorized call fails.
#[test]
#[should_panic]
fn set_policy_requires_auth() {
    let env = Env::default();
    // No mock_all_auths -> admin.require_auth() has no matching authorization.
    let (c, _admin) = seed(&env);
    c.set_policy(&Symbol::new(&env, "MX"), &1, &0);
}

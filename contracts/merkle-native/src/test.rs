extern crate std;
use super::*;
use soroban_sdk::{BytesN, Env};

// From gen-vectors.mjs (circomlibjs through scripts/merkle.mjs, the prover's own helper).
const EMPTY: &str = "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2";
const LEAVES: [&str; 5] = [
    "0000000000000000000000000000000000000000000000000000000000000001",
    "0000000000000000000000000000000000000000000000000000000000000002",
    "0000000000000000000000000000000000000000000000000000000000000003",
    "2a3617f2743245519e19607a4417189a115cc0f5e7d690413df64c6b9662e9cf",
    "0000000000000000000000000000000000000000000000000000000000000005",
];
const ROOTS: [&str; 5] = [
    "010859ebab455b4fe07b22efecf1ea30195d7056d131668bd609fde0e45afa0d",
    "02b85b06e471c60f9a78dc7642c141f9cc422102fbc99d406bdadf64c4c91672",
    "07b248024e18c30f6c8a6c63dad3748d72cd13d1197bfd79a1323216d6ac6e99",
    "0790dd6f9b26bd3de21421d8f035fb4cf8d4dfef7e8b494b51843fc029646158",
    "2bad1a57e362b7892b678e3a799bd4d242a03732cb365c514cdb8de17c9b6ac1",
];
// Leaves 1..=1024: the full tree, last insert at index 1023.
const FULL: &str = "2a6e6d774d6a9d4ef7317c4b5a5d0a7ed4dfff312d564b2aed8be55fe2ce9167";

fn b(env: &Env, h: &str) -> BytesN<32> {
    let mut a = [0u8; 32];
    for i in 0..32 {
        a[i] = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).unwrap();
    }
    BytesN::from_array(env, &a)
}

fn u(env: &Env, n: u32) -> BytesN<32> {
    let mut a = [0u8; 32];
    a[28..].copy_from_slice(&n.to_be_bytes());
    BytesN::from_array(env, &a)
}

fn setup() -> (Env, MerkleNativeClient<'static>) {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    let id = env.register(MerkleNative, ());
    let c = MerkleNativeClient::new(&env, &id);
    (env, c)
}

#[test]
fn roots_match_circomlibjs() {
    let (env, c) = setup();
    assert_eq!(c.root(), b(&env, EMPTY));
    for i in 0..5 {
        let (idx, root) = c.insert(&b(&env, LEAVES[i]));
        assert_eq!(idx, i as u32);
        assert_eq!(root, b(&env, ROOTS[i]));
        assert_eq!(c.root(), root);
    }
    assert_eq!(c.leaf_count(), 5);
    // [1,2] -> circomlibjs / live pool.poseidon_hash value.
    assert_eq!(
        c.hash(&u(&env, 1), &u(&env, 2)),
        b(&env, "115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a")
    );
}

#[test]
fn full_tree_then_tree_full() {
    let (env, c) = setup();
    for i in 1..=1024u32 {
        c.insert(&u(&env, i));
    }
    assert_eq!(c.root(), b(&env, FULL));
    assert_eq!(c.try_insert(&u(&env, 7)), Err(Ok(soroban_sdk::Error::from_contract_error(Error::TreeFull as u32))));
}

#[test]
fn rejects_non_canonical() {
    let (env, c) = setup();
    // r itself (== 0 mod r) and 1 + r (== 1 mod r): Bn254Fr::from_bytes would accept both.
    let r = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001";
    let r1 = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000002";
    let ff = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    for h in [r, r1, ff] {
        assert_eq!(c.try_insert(&b(&env, h)), Err(Ok(soroban_sdk::Error::from_contract_error(Error::NonCanonicalField as u32))));
        assert_eq!(c.try_hash(&b(&env, h), &u(&env, 1)), Err(Ok(soroban_sdk::Error::from_contract_error(Error::NonCanonicalField as u32))));
    }
    // r - 1 is the largest canonical value.
    let rm1 = "30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000000";
    assert!(c.try_insert(&b(&env, rm1)).is_ok());
    assert_eq!(c.leaf_count(), 1);
}

#[test]
fn cost() {
    let (env, c) = setup();
    for i in 1..=1023u32 {
        c.insert(&u(&env, i));
    }
    let mut budget = env.cost_estimate().budget();
    budget.reset_unlimited();
    c.insert(&u(&env, 1024)); // index 1023: every level takes the right-child path
    std::println!("INSERT_CPU {}", budget.cpu_instruction_cost());
    std::println!("INSERT_MEM {}", budget.memory_bytes_cost());
    budget.reset_unlimited();
    c.hash(&u(&env, 1), &u(&env, 2));
    std::println!("HASH_CPU {}", budget.cpu_instruction_cost());
}

//! Tukar merkle-native: the pool's depth-10 Poseidon Merkle tree, advanced ON-CHAIN
//! with the CAP-75 (Protocol 25) native `poseidon_permutation` host function via SDF's
//! `soroban-poseidon` crate, instead of the live pool's merkleUpdate SNARK.
//!
//! Same tree as `circuits/lib/merkleProof.circom` + `circuits/merkleUpdate.circom`
//! (and `scripts/merkle.mjs`): depth 10, empty leaf = 0, internal node =
//! circomlib Poseidon(2) over BN254, leaf index bits LSB-first (bit = 1 -> right child).
//! The leaf is inserted raw (it is already a Poseidon commitment), not re-hashed.
//!
//! Standard incremental ("filled subtrees") insert: 10 hashes per leaf.
//!
//! ponytail: `insert` is permissionless — this contract measures and proves the
//! on-chain hashing path. A pool adopting it must gate `insert` on a backed
//! commitment (exactly as `pool.register_root_verified` does) before use.
#![no_std]

use soroban_poseidon::PoseidonSponge;
use soroban_sdk::{
    bytesn, contract, contracterror, contractimpl, contracttype, crypto::bn254::Bn254Fr,
    panic_with_error, symbol_short, vec, BytesN, Env, Vec, U256,
};

pub const LEVELS: u32 = 10;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// 32 bytes are not a canonical BN254 scalar (value >= r).
    NonCanonicalField = 1,
    TreeFull = 2,
}

#[contracttype]
enum Key {
    Root,
    Count,
    Zeros,  // zeros[i] = root of an empty subtree of height i, i in 0..=LEVELS
    Filled, // filled[i] = last left node written at level i
}

fn modulus(env: &Env) -> U256 {
    U256::from_be_bytes(
        env,
        &bytesn!(env, 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001).into(),
    )
}

/// Parse a caller-supplied field element, rejecting non-canonical encodings.
/// `Bn254Fr::from_bytes` silently reduces mod r, so x and x+r would otherwise be two
/// distinct byte strings for one field value. We check the raw integer instead.
fn canonical(env: &Env, b: &BytesN<32>) -> U256 {
    let v = U256::from_be_bytes(env, &b.clone().into());
    if v >= modulus(env) {
        panic_with_error!(env, Error::NonCanonicalField);
    }
    v
}

fn to_bytes(v: &U256) -> BytesN<32> {
    BytesN::try_from(v.to_be_bytes()).unwrap()
}

#[contract]
pub struct MerkleNative;

#[contractimpl]
impl MerkleNative {
    pub fn __constructor(env: Env) {
        let mut sponge = PoseidonSponge::<3, Bn254Fr>::new(&env);
        let mut zeros: Vec<U256> = vec![&env, U256::from_u32(&env, 0)];
        for i in 0..LEVELS {
            let z = zeros.get_unchecked(i);
            zeros.push_back(sponge.compute_hash(&vec![&env, z.clone(), z]));
        }
        let filled: Vec<U256> = zeros.slice(0..LEVELS);
        let s = env.storage().instance();
        s.set(&Key::Root, &zeros.get_unchecked(LEVELS));
        s.set(&Key::Count, &0u32);
        s.set(&Key::Zeros, &zeros);
        s.set(&Key::Filled, &filled);
    }

    /// Append `leaf` at the next free index; returns (index, new root).
    pub fn insert(env: Env, leaf: BytesN<32>) -> (u32, BytesN<32>) {
        let mut cur = canonical(&env, &leaf);
        let s = env.storage().instance();
        let n: u32 = s.get(&Key::Count).unwrap();
        if n >= 1 << LEVELS {
            panic_with_error!(&env, Error::TreeFull);
        }
        let zeros: Vec<U256> = s.get(&Key::Zeros).unwrap();
        let mut filled: Vec<U256> = s.get(&Key::Filled).unwrap();
        let mut sponge = PoseidonSponge::<3, Bn254Fr>::new(&env);
        let mut idx = n;
        for l in 0..LEVELS {
            let (left, right) = if idx & 1 == 0 {
                filled.set(l, cur.clone());
                (cur, zeros.get_unchecked(l))
            } else {
                (filled.get_unchecked(l), cur)
            };
            cur = sponge.compute_hash(&vec![&env, left, right]);
            idx >>= 1;
        }
        s.set(&Key::Filled, &filled);
        s.set(&Key::Root, &cur);
        s.set(&Key::Count, &(n + 1));
        let root = to_bytes(&cur);
        env.events().publish((symbol_short!("insert"), n), (leaf, root.clone()));
        (n, root)
    }

    pub fn root(env: Env) -> BytesN<32> {
        to_bytes(&env.storage().instance().get(&Key::Root).unwrap())
    }

    pub fn leaf_count(env: Env) -> u32 {
        env.storage().instance().get(&Key::Count).unwrap()
    }

    /// One native Poseidon(2) — directly comparable with the live `pool.poseidon_hash`
    /// (hand-rolled over Bn254Fr ops) for a per-hash cost measurement.
    pub fn hash(env: Env, a: BytesN<32>, b: BytesN<32>) -> BytesN<32> {
        let v = vec![&env, canonical(&env, &a), canonical(&env, &b)];
        to_bytes(&PoseidonSponge::<3, Bn254Fr>::new(&env).compute_hash(&v))
    }
}

#[cfg(test)]
mod test;

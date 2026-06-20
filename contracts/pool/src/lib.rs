#![no_std]

//! Tukar pool — the stateful corridor contract that orchestrates the three ZK
//! verifiers.
//!
//! Responsibilities:
//!   * **Root registry**: the commitment Merkle tree is maintained off-chain by
//!     the operator/indexer (as in the Nethermind reference); the operator
//!     publishes new roots here. Spends may reference any historically known
//!     root.
//!   * **Double-spend prevention**: a persistent nullifier set. This is the
//!     security-critical state that *must* live on-chain.
//!   * **Trustless spend authorization**: `transfer` and `withdraw` are gated by
//!     a Groth16 proof, verified by cross-contract call to the deployed
//!     `transfer` verifier. `check_compliance` / `disclose` forward to the
//!     `compliance` / `disclosure` verifiers.
//!
//! The proof/public-input types mirror the verifier contract exactly so the
//! values forward across the contract boundary unchanged.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    symbol_short, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const VERIFY: Symbol = symbol_short!("verify");

/// Groth16 proof — identical layout to the verifier's `Groth16Proof` so it
/// forwards across the cross-contract call unchanged.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PoolError {
    UnknownRoot = 1,
    NullifierUsed = 2,
    AlreadyInitialized = 3,
}

#[contracttype]
enum DataKey {
    Admin,
    TransferVerifier,
    ComplianceVerifier,
    DisclosureVerifier,
    CurrentRoot,
    Count,
    Root(BytesN<32>),       // -> () : a known (historical) Merkle root
    Nullifier(BytesN<32>),  // -> () : a spent nullifier
}

#[contract]
pub struct Pool;

#[contractimpl]
impl Pool {
    /// Initialize the pool with the operator admin, the three verifier contract
    /// addresses, and the initial (empty-tree) Merkle root.
    pub fn __constructor(
        env: Env,
        admin: Address,
        transfer_verifier: Address,
        compliance_verifier: Address,
        disclosure_verifier: Address,
        initial_root: BytesN<32>,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TransferVerifier, &transfer_verifier);
        s.set(&DataKey::ComplianceVerifier, &compliance_verifier);
        s.set(&DataKey::DisclosureVerifier, &disclosure_verifier);
        s.set(&DataKey::CurrentRoot, &initial_root);
        s.set(&DataKey::Count, &0u32);
        env.storage().persistent().set(&DataKey::Root(initial_root), &());
    }

    /// Operator publishes a new Merkle root (after off-chain tree updates).
    pub fn register_root(env: Env, new_root: BytesN<32>) {
        Self::admin(&env).require_auth();
        env.storage().persistent().set(&DataKey::Root(new_root.clone()), &());
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);
        env.events().publish((symbol_short!("root"),), new_root);
    }

    /// Public deposit: record a new commitment entering the corridor. The
    /// off-chain indexer inserts it into the tree and calls `register_root`.
    pub fn deposit(env: Env, commitment: BytesN<32>) -> u32 {
        let s = env.storage().instance();
        let count: u32 = s.get(&DataKey::Count).unwrap_or(0);
        let index = count;
        s.set(&DataKey::Count, &(count + 1));
        env.events().publish((symbol_short!("deposit"), index), commitment);
        index
    }

    /// Trustless private transfer: verify the JoinSplit proof, ensure the
    /// referenced root is known and the input nullifiers are unspent, then mark
    /// them spent and record the output commitments.
    pub fn transfer(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<Bn254Fr>,
        root: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        out_commitments: Vec<BytesN<32>>,
    ) {
        Self::require_known_root(&env, &root);
        Self::verify_with(&env, DataKey::TransferVerifier, &proof, &public_inputs);
        Self::spend_nullifiers(&env, &nullifiers);
        for c in out_commitments.iter() {
            let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
            env.storage().instance().set(&DataKey::Count, &(count + 1));
            env.events().publish((symbol_short!("out"), count), c);
        }
        env.events().publish((symbol_short!("transfer"),), root);
    }

    /// Trustless withdraw at a corridor edge: verify the proof, spend the input
    /// nullifier(s), and emit the public withdrawal (amount/recipient are public
    /// at the edge by design).
    pub fn withdraw(
        env: Env,
        proof: Groth16Proof,
        public_inputs: Vec<Bn254Fr>,
        root: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        recipient: Address,
        amount: i128,
    ) {
        Self::require_known_root(&env, &root);
        Self::verify_with(&env, DataKey::TransferVerifier, &proof, &public_inputs);
        Self::spend_nullifiers(&env, &nullifiers);
        env.events()
            .publish((symbol_short!("withdraw"), recipient), amount);
    }

    /// Verify an ASP compliance proof (membership + non-membership) for a source
    /// at a corridor edge. Returns true, or reverts if the proof is invalid.
    pub fn check_compliance(env: Env, proof: Groth16Proof, public_inputs: Vec<Bn254Fr>) -> bool {
        Self::verify_with(&env, DataKey::ComplianceVerifier, &proof, &public_inputs);
        true
    }

    /// Verify a selective-disclosure proof handed to a regulator. Read-only.
    pub fn disclose(env: Env, proof: Groth16Proof, public_inputs: Vec<Bn254Fr>) -> bool {
        Self::verify_with(&env, DataKey::DisclosureVerifier, &proof, &public_inputs);
        true
    }

    // ---- views ----
    pub fn current_root(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::CurrentRoot).unwrap()
    }
    pub fn is_root_known(env: Env, root: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Root(root))
    }
    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Nullifier(nullifier))
    }
    pub fn commitment_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    // ---- internals ----
    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    fn require_known_root(env: &Env, root: &BytesN<32>) {
        if !env.storage().persistent().has(&DataKey::Root(root.clone())) {
            soroban_sdk::panic_with_error!(env, PoolError::UnknownRoot);
        }
    }

    fn spend_nullifiers(env: &Env, nullifiers: &Vec<BytesN<32>>) {
        for n in nullifiers.iter() {
            let key = DataKey::Nullifier(n.clone());
            if env.storage().persistent().has(&key) {
                soroban_sdk::panic_with_error!(env, PoolError::NullifierUsed);
            }
            env.storage().persistent().set(&key, &());
        }
    }

    /// Cross-contract call to a verifier's `verify(proof, public_inputs)`.
    /// Reverts (via the verifier's own error) if the proof is invalid.
    fn verify_with(env: &Env, which: DataKey, proof: &Groth16Proof, public_inputs: &Vec<Bn254Fr>) {
        let verifier: Address = env.storage().instance().get(&which).unwrap();
        let _ok: bool = env.invoke_contract(
            &verifier,
            &VERIFY,
            vec![env, proof.into_val(env), public_inputs.into_val(env)],
        );
    }
}

#[cfg(test)]
mod test;

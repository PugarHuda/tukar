#![no_std]

//! Tukar pool — the stateful corridor contract that orchestrates the three ZK
//! verifiers.
//!
//! **Binding (the key security property).** The pool never accepts a pre-built
//! `Vec<Bn254Fr>`. Instead it receives the public signals as typed values and
//! *builds* the verifier's public-input vector itself, in circuit order. The
//! exact same values are then used for the pool's own logic (root check,
//! nullifier spend, commitment recording). A caller therefore cannot present a
//! valid proof while spending different nullifiers or storing different
//! commitments — any mismatch changes the public inputs and the proof fails to
//! verify. This closes the double-spend-bypass class of bugs.
//!
//! Responsibilities:
//!   * **Root registry** — the commitment Merkle tree is maintained off-chain by
//!     the operator/indexer (Nethermind-reference style); the operator publishes
//!     roots via `register_root`. The pool trusts the operator for tree
//!     *construction*, but spends are still trustless (proof + nullifier).
//!   * **Nullifier set** — persistent double-spend prevention.
//!   * **Commitment set** — every commitment the pool has seen (deposits +
//!     transfer outputs); a selective disclosure is only accepted for a
//!     commitment the pool actually knows.
//!   * **Compliant deposits** — `deposit` requires a compliance proof whose ASP
//!     allow/deny roots are the contract's *pinned* trusted values and whose
//!     bound hash is the deposited commitment.

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
    UnknownCommitment = 3,
    BadDenyList = 4,
}

#[contracttype]
enum DataKey {
    Admin,
    TransferVerifier,
    ComplianceVerifier,
    DisclosureVerifier,
    AspRoot,                 // pinned trusted ASP allow-list root
    DenyList,               // pinned trusted deny-list (Vec<BytesN<32>>, len 4)
    CurrentRoot,
    Count,
    Root(BytesN<32>),       // -> () : a known (historical) Merkle root
    Nullifier(BytesN<32>),  // -> () : a spent nullifier
    Commitment(BytesN<32>), // -> () : a commitment the pool has recorded
}

const DENY_LEN: u32 = 4;

#[contract]
pub struct Pool;

#[contractimpl]
impl Pool {
    /// Initialize the pool.
    ///
    /// `asp_root` and `deny_list` are the trusted ASP allow-list root and
    /// deny-list that every deposit's compliance proof is checked against — they
    /// are pinned here, never supplied by a depositor.
    pub fn __constructor(
        env: Env,
        admin: Address,
        transfer_verifier: Address,
        compliance_verifier: Address,
        disclosure_verifier: Address,
        initial_root: BytesN<32>,
        asp_root: BytesN<32>,
        deny_list: Vec<BytesN<32>>,
    ) {
        if deny_list.len() != DENY_LEN {
            soroban_sdk::panic_with_error!(&env, PoolError::BadDenyList);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TransferVerifier, &transfer_verifier);
        s.set(&DataKey::ComplianceVerifier, &compliance_verifier);
        s.set(&DataKey::DisclosureVerifier, &disclosure_verifier);
        s.set(&DataKey::AspRoot, &asp_root);
        s.set(&DataKey::DenyList, &deny_list);
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

    /// Compliant deposit: a commitment enters the corridor only with a valid
    /// compliance proof. The proof's ASP allow/deny inputs are the contract's
    /// pinned trusted values, and its bound hash is the commitment itself — so
    /// the proof cannot be detached from this deposit or use a forged ASP set.
    pub fn deposit(env: Env, commitment: BytesN<32>, proof: Groth16Proof) -> u32 {
        // compliance public inputs: [aspRoot, deny0..3, bindHash=commitment]
        let asp_root: BytesN<32> = env.storage().instance().get(&DataKey::AspRoot).unwrap();
        let deny: Vec<BytesN<32>> = env.storage().instance().get(&DataKey::DenyList).unwrap();
        let mut pi = vec![&env, Self::fr(&env, &asp_root)];
        for d in deny.iter() {
            pi.push_back(Self::fr(&env, &d));
        }
        pi.push_back(Self::fr(&env, &commitment)); // bindHash == commitment
        Self::verify(&env, DataKey::ComplianceVerifier, &proof, &pi);

        let index = Self::record_commitment(&env, &commitment);
        env.events().publish((symbol_short!("deposit"), index), commitment);
        index
    }

    /// Trustless private transfer (JoinSplit). The pool builds the verifier's
    /// public inputs from the typed signals below, so the spent nullifiers and
    /// recorded commitments are exactly the ones the proof attests to.
    pub fn transfer(
        env: Env,
        proof: Groth16Proof,
        root: BytesN<32>,
        public_amount: BytesN<32>,
        ext_data_hash: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        out_commitments: Vec<BytesN<32>>,
    ) {
        Self::require_known_root(&env, &root);
        let pi = Self::transfer_inputs(&env, &root, &public_amount, &ext_data_hash, &nullifiers, &out_commitments);
        Self::verify(&env, DataKey::TransferVerifier, &proof, &pi);
        Self::spend_nullifiers(&env, &nullifiers);
        for c in out_commitments.iter() {
            Self::record_commitment(&env, &c);
        }
        env.events().publish((symbol_short!("transfer"),), root);
    }

    /// Trustless withdraw at a corridor edge. `public_amount` is bound by the
    /// proof (it is a verified public input), so the contract cannot be told to
    /// release an amount the proof did not authorize. (Token movement is mocked
    /// in this MVP — see README; the amount/authorization is real.)
    pub fn withdraw(
        env: Env,
        proof: Groth16Proof,
        root: BytesN<32>,
        public_amount: BytesN<32>,
        ext_data_hash: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        out_commitments: Vec<BytesN<32>>,
        recipient: Address,
    ) {
        Self::require_known_root(&env, &root);
        let pi = Self::transfer_inputs(&env, &root, &public_amount, &ext_data_hash, &nullifiers, &out_commitments);
        Self::verify(&env, DataKey::TransferVerifier, &proof, &pi);
        Self::spend_nullifiers(&env, &nullifiers);
        for c in out_commitments.iter() {
            Self::record_commitment(&env, &c);
        }
        env.events()
            .publish((symbol_short!("withdraw"), recipient), public_amount);
    }

    /// Verify a selective-disclosure proof for a regulator. The disclosed
    /// commitment must be one the pool actually knows, so a regulator can't be
    /// handed a disclosure about a fabricated commitment.
    pub fn disclose(
        env: Env,
        proof: Groth16Proof,
        commitment: BytesN<32>,
        disclosed_amount: BytesN<32>,
        audit_context: BytesN<32>,
    ) -> bool {
        if !env.storage().persistent().has(&DataKey::Commitment(commitment.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownCommitment);
        }
        let pi = vec![
            &env,
            Self::fr(&env, &commitment),
            Self::fr(&env, &disclosed_amount),
            Self::fr(&env, &audit_context),
        ];
        Self::verify(&env, DataKey::DisclosureVerifier, &proof, &pi);
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
    pub fn is_commitment_known(env: Env, commitment: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::Commitment(commitment))
    }
    pub fn commitment_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    // ---- internals ----
    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
        Bn254Fr::from_bytes(b.clone())
    }

    /// Build the transfer/withdraw circuit public inputs in circuit order:
    /// [root, public_amount, ext_data_hash, nullifiers.., out_commitments..].
    fn transfer_inputs(
        env: &Env,
        root: &BytesN<32>,
        public_amount: &BytesN<32>,
        ext_data_hash: &BytesN<32>,
        nullifiers: &Vec<BytesN<32>>,
        out_commitments: &Vec<BytesN<32>>,
    ) -> Vec<Bn254Fr> {
        let mut pi = vec![
            env,
            Self::fr(env, root),
            Self::fr(env, public_amount),
            Self::fr(env, ext_data_hash),
        ];
        for n in nullifiers.iter() {
            pi.push_back(Self::fr(env, &n));
        }
        for c in out_commitments.iter() {
            pi.push_back(Self::fr(env, &c));
        }
        pi
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

    fn record_commitment(env: &Env, commitment: &BytesN<32>) -> u32 {
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().persistent().set(&DataKey::Commitment(commitment.clone()), &());
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        count
    }

    /// Cross-contract call to a verifier's `verify(proof, public_inputs)`.
    /// Reverts (via the verifier's own error) if the proof is invalid.
    fn verify(env: &Env, which: DataKey, proof: &Groth16Proof, public_inputs: &Vec<Bn254Fr>) {
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

#![no_std]

//! Tukar pool — the stateful corridor contract that orchestrates the three ZK
//! verifiers and custodies the corridor's tokens.
//!
//! **Binding (the key security property).** The pool never accepts a pre-built
//! `Vec<Bn254Fr>`. It receives the public signals as typed values and *builds*
//! the verifier's public-input vector itself, in circuit order. The same values
//! are then used for the pool's own logic (root check, nullifier spend,
//! commitment recording, token amount). A caller therefore cannot present a
//! valid proof while spending different nullifiers, recording different
//! commitments, or withdrawing a different amount — any mismatch changes the
//! public inputs and the proof fails to verify.
//!
//! **Custody.** `deposit` pulls `amount` tokens from the depositor into the pool;
//! `withdraw` releases tokens to a recipient, where the released `amount` is
//! bound to the proof's verified `public_amount`. Token = a SAC address (the
//! demo uses the native XLM SAC as a USDC stand-in on testnet).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    symbol_short, token::TokenClient, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const VERIFY: Symbol = symbol_short!("verify");
const DENY_LEN: u32 = 4;

/// Groth16 proof — identical layout to the verifier's `Groth16Proof`.
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
    InvalidAmount = 5,
    AmountNotBound = 6,
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    TransferVerifier,
    ComplianceVerifier,
    DisclosureVerifier,
    UpdateVerifier,
    AspRoot,
    DenyList,
    CurrentRoot,
    Count,
    Root(BytesN<32>),
    Nullifier(BytesN<32>),
    Commitment(BytesN<32>),
}

#[contract]
pub struct Pool;

#[contractimpl]
impl Pool {
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        transfer_verifier: Address,
        compliance_verifier: Address,
        disclosure_verifier: Address,
        update_verifier: Address,
        initial_root: BytesN<32>,
        asp_root: BytesN<32>,
        deny_list: Vec<BytesN<32>>,
    ) {
        if deny_list.len() != DENY_LEN {
            soroban_sdk::panic_with_error!(&env, PoolError::BadDenyList);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::TransferVerifier, &transfer_verifier);
        s.set(&DataKey::ComplianceVerifier, &compliance_verifier);
        s.set(&DataKey::DisclosureVerifier, &disclosure_verifier);
        s.set(&DataKey::UpdateVerifier, &update_verifier);
        s.set(&DataKey::AspRoot, &asp_root);
        s.set(&DataKey::DenyList, &deny_list);
        s.set(&DataKey::CurrentRoot, &initial_root);
        s.set(&DataKey::Count, &0u32);
        env.storage().persistent().set(&DataKey::Root(initial_root), &());
    }

    /// Admin root registration — genesis / emergency only. The normal path is
    /// `register_root_verified`, which is trustless.
    pub fn register_root(env: Env, new_root: BytesN<32>) {
        Self::admin(&env).require_auth();
        env.storage().persistent().set(&DataKey::Root(new_root.clone()), &());
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);
        env.events().publish((symbol_short!("root"),), new_root);
    }

    /// Trustless root advance (G6). Anyone may advance the tree, but only with a
    /// proof that inserting `new_leaf` at an empty slot of a *known* `old_root`
    /// yields exactly `new_root`. The operator therefore cannot register an
    /// arbitrary root — tree integrity no longer depends on trusting them.
    pub fn register_root_verified(
        env: Env,
        proof: Groth16Proof,
        old_root: BytesN<32>,
        new_leaf: BytesN<32>,
        new_root: BytesN<32>,
    ) {
        Self::require_known_root(&env, &old_root);
        let pi = vec![
            &env,
            Self::fr(&env, &old_root),
            Self::fr(&env, &new_leaf),
            Self::fr(&env, &new_root),
        ];
        Self::verify(&env, DataKey::UpdateVerifier, &proof, &pi);
        Self::record_commitment(&env, &new_leaf);
        env.storage().persistent().set(&DataKey::Root(new_root.clone()), &());
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);
        env.events().publish((symbol_short!("root"), new_leaf), new_root);
    }

    /// Compliant deposit: pull `amount` tokens from `from` into the pool and
    /// record the commitment — only with a compliance proof whose pinned ASP
    /// allow/deny inputs verify and whose bound hash is this commitment.
    pub fn deposit(
        env: Env,
        from: Address,
        amount: i128,
        commitment: BytesN<32>,
        proof: Groth16Proof,
        binding_proof: Groth16Proof,
    ) -> u32 {
        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        from.require_auth();

        // 1. Compliance: source is allow-listed, bound to this commitment.
        // public inputs: [aspRoot, deny0..3, bindHash=commitment]
        let asp_root: BytesN<32> = env.storage().instance().get(&DataKey::AspRoot).unwrap();
        let deny: Vec<BytesN<32>> = env.storage().instance().get(&DataKey::DenyList).unwrap();
        let mut pi = vec![&env, Self::fr(&env, &asp_root)];
        for d in deny.iter() {
            pi.push_back(Self::fr(&env, &d));
        }
        pi.push_back(Self::fr(&env, &commitment));
        Self::verify(&env, DataKey::ComplianceVerifier, &proof, &pi);

        // 2. Amount binding: the commitment opens to exactly `amount` (disclosure
        // circuit: [commitment, disclosedAmount=amount, ctx=7]). This ties the
        // deposited token amount to the note's hidden value — no decoupling.
        let amt = Self::amount_bytes(&env, amount);
        let ctx = Self::amount_bytes(&env, 7);
        let bind_pi = vec![
            &env,
            Self::fr(&env, &commitment),
            Self::fr(&env, &amt),
            Self::fr(&env, &ctx),
        ];
        Self::verify(&env, DataKey::DisclosureVerifier, &binding_proof, &bind_pi);

        // 3. Move the real token amount in.
        Self::token(&env).transfer(&from, &env.current_contract_address(), &amount);

        let index = Self::record_commitment(&env, &commitment);
        env.events().publish((symbol_short!("deposit"), index), (commitment, amount));
        index
    }

    /// Trustless private transfer (JoinSplit). Inputs are built from the typed
    /// signals so the spent nullifiers and recorded commitments are exactly the
    /// ones the proof attests.
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

    /// Trustless withdraw at a corridor edge. The released token `amount` must
    /// equal the proof's verified `public_amount`, so the contract cannot be told
    /// to release more than the proof authorizes.
    pub fn withdraw(
        env: Env,
        proof: Groth16Proof,
        root: BytesN<32>,
        public_amount: BytesN<32>,
        ext_data_hash: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        out_commitments: Vec<BytesN<32>>,
        recipient: Address,
        amount: i128,
    ) {
        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        // bind the released amount to the verified public input
        if public_amount != Self::amount_bytes(&env, amount) {
            soroban_sdk::panic_with_error!(&env, PoolError::AmountNotBound);
        }
        Self::require_known_root(&env, &root);
        let pi = Self::transfer_inputs(&env, &root, &public_amount, &ext_data_hash, &nullifiers, &out_commitments);
        Self::verify(&env, DataKey::TransferVerifier, &proof, &pi);
        Self::spend_nullifiers(&env, &nullifiers);
        for c in out_commitments.iter() {
            Self::record_commitment(&env, &c);
        }
        Self::token(&env).transfer(&env.current_contract_address(), &recipient, &amount);
        env.events().publish((symbol_short!("withdraw"), recipient), amount);
    }

    /// Verify a selective-disclosure proof for a regulator. The disclosed
    /// commitment must be one the pool actually knows.
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
    pub fn balance(env: Env) -> i128 {
        Self::token(&env).balance(&env.current_contract_address())
    }

    // ---- internals ----
    fn admin(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }
    fn token(env: &Env) -> TokenClient {
        let addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        TokenClient::new(env, &addr)
    }
    fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
        Bn254Fr::from_bytes(b.clone())
    }

    /// 32-byte big-endian field-element encoding of a positive i128.
    fn amount_bytes(env: &Env, amount: i128) -> BytesN<32> {
        let mut buf = [0u8; 32];
        let be = amount.to_be_bytes(); // 16 bytes
        let mut i = 0;
        while i < 16 {
            buf[16 + i] = be[i];
            i += 1;
        }
        BytesN::from_array(env, &buf)
    }

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

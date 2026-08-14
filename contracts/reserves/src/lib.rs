#![no_std]

//! Tukar reserves — a REAL cryptographic proof-of-reserves for the corridor pool.
//!
//! Additive to the live pool (read-only; touches none of the 8 live contracts). The
//! operator's old "reserves" panel showed on-chain custody next to a commitment count
//! and honestly said it was NOT a cryptographic proof-of-reserves. This contract makes
//! it real: `attest` reads the pool's live custody `balance()` and its `leaves()` (the
//! on-chain note commitments), REBUILDS the reserves-circuit public-input vector itself
//! from those leaves (the same binding discipline the pool uses — it never trusts a
//! caller-supplied input vector), verifies a Groth16 proof that the note openings sum to
//! a declared liabilities figure, and refuses the attestation unless
//! `declared_liabilities <= custody`. The proof reveals no individual note amount.
//!
//! Binding: because the contract fills the commitment slots from the pool's own
//! `leaves()` (padding unused slots with the fixed constant `Poseidon(0,0,0)`), the
//! proven sum is over the ACTUAL on-chain note set — the operator cannot swap in a
//! cheaper set or understate the total (the circuit enforces sum == declared, equality).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    symbol_short, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const VERIFY: Symbol = symbol_short!("verify");
const BALANCE: Symbol = symbol_short!("balance");
const LEAVES: Symbol = symbol_short!("leaves");

// Fixed circuit width. The reserves circuit is Reserves(32): it can attest a pool with
// up to 32 note leaves; unused slots are padded with Poseidon(0,0,0). The live pool is
// depth-10 (up to 1024 leaves), so this is a demo ceiling.
// ponytail: fixed N=32 covers the pool's current leaf set; a fuller pool needs a bigger
// ptau (already used pot15) or a batched/recursive attestation. Upgrade path when leaf
// count can exceed 32: aggregate per-batch reserves proofs into one.
const N: u32 = 32;

// Padding commitment = Poseidon(0,0,0) (circomlib t=4), the commitment of the zero
// opening. Unused circuit slots use it and contribute 0 to the sum; the contract inserts
// the SAME constant so the padding is bound. Precomputed with circomlibjs (canonical, < r).
const PAD: [u8; 32] = [
    0x0b, 0xc1, 0x88, 0xd2, 0x7d, 0xcc, 0xea, 0xdc, 0x1d, 0xcf, 0xb6, 0xaf, 0x0a, 0x7a, 0xf0, 0x8f,
    0xe2, 0x86, 0x4e, 0xec, 0xec, 0x96, 0xc5, 0xae, 0x7c, 0xee, 0x6d, 0xb3, 0x1b, 0xa5, 0x99, 0xaa,
];

/// Groth16 proof — identical layout to the verifier's / pool's `Groth16Proof`.
#[contracttype]
#[derive(Clone)]
pub struct Groth16Proof {
    pub a: Bn254G1Affine,
    pub b: Bn254G2Affine,
    pub c: Bn254G1Affine,
}

/// A timestamped solvency attestation. Amounts are in token base units (USDC stroops),
/// the same unit as the pool's `balance()` and the note amounts inside the commitments.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub liabilities: i128,
    pub reserves: i128,
    pub timestamp: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ReservesError {
    ProofRejected = 1,
    Insolvent = 2,
    TooManyLeaves = 3,
    InvalidAmount = 4,
}

#[contracttype]
enum DataKey {
    Admin,
    Pool,
    Verifier,
    Latest,
}

#[contract]
pub struct Reserves;

#[contractimpl]
impl Reserves {
    /// `admin` (the corridor operator) can re-point the pool/verifier later; `pool` is the
    /// corridor pool this attests reserves for; `reserves_verifier` is the deployed BN254
    /// verifier for the reserves circuit.
    pub fn __constructor(env: Env, admin: Address, pool: Address, reserves_verifier: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Pool, &pool);
        s.set(&DataKey::Verifier, &reserves_verifier);
    }

    /// Verify a proof-of-reserves and record a solvency attestation.
    ///
    /// Reads the pool's live custody and leaf set, REBUILDS the public inputs from the
    /// leaves (padding to N with `Poseidon(0,0,0)`), verifies the proof that the note
    /// openings sum to `declared_liabilities`, then panics `Insolvent` unless
    /// `declared_liabilities <= reserves`. On success stores + emits an `Attestation`.
    pub fn attest(env: Env, proof: Groth16Proof, declared_liabilities: i128) -> Attestation {
        if declared_liabilities < 0 || declared_liabilities >= (1i128 << 64) {
            soroban_sdk::panic_with_error!(&env, ReservesError::InvalidAmount);
        }
        let pool: Address = env.storage().instance().get(&DataKey::Pool).unwrap();

        // Cross-contract, read-only: live custody and the on-chain note commitments.
        let reserves: i128 = env.invoke_contract(&pool, &BALANCE, Vec::new(&env));
        let leaves: Vec<BytesN<32>> = env.invoke_contract(&pool, &LEAVES, Vec::new(&env));
        if leaves.len() > N {
            soroban_sdk::panic_with_error!(&env, ReservesError::TooManyLeaves);
        }

        // BINDING: build the public-input vector FROM the pool's own leaves, in circuit
        // order [commitments(N), declaredLiabilities]. Real slots are pool leaves; unused
        // slots are the padding constant. A caller cannot substitute a different note set.
        let pad = BytesN::from_array(&env, &PAD);
        let mut pi = vec![&env];
        for i in 0..N {
            let c = if i < leaves.len() { leaves.get(i).unwrap() } else { pad.clone() };
            pi.push_back(Bn254Fr::from_bytes(c));
        }
        pi.push_back(Bn254Fr::from_bytes(Self::amount_bytes(&env, declared_liabilities)));

        // The verifier traps on an invalid proof; we ALSO assert its bool so a verifier
        // returning `false` can never make the check a no-op (same discipline as the pool).
        let ok: bool = env.invoke_contract(
            &env.storage().instance().get::<_, Address>(&DataKey::Verifier).unwrap(),
            &VERIFY,
            vec![&env, proof.into_val(&env), pi.into_val(&env)],
        );
        if !ok {
            soroban_sdk::panic_with_error!(&env, ReservesError::ProofRejected);
        }

        // ponytail: the whole leaf set is treated as outstanding obligations. This
        // OVER-counts already-spent notes (a spent note still has a leaf) — but that only
        // OVER-states liabilities, so passing `declared_liabilities <= reserves` is
        // conservative (fail-safe). Upgrade path: subtract spent notes by checking each
        // leaf's nullifier via the pool's `is_nullifier_used` before summing.
        if declared_liabilities > reserves {
            soroban_sdk::panic_with_error!(&env, ReservesError::Insolvent);
        }

        let att = Attestation {
            liabilities: declared_liabilities,
            reserves,
            timestamp: env.ledger().timestamp(),
        };
        env.storage().instance().set(&DataKey::Latest, &att);
        env.events()
            .publish((symbol_short!("attest"),), (att.liabilities, att.reserves, att.timestamp));
        att
    }

    /// The most recent solvency attestation, or None if none has been recorded.
    pub fn latest_attestation(env: Env) -> Option<Attestation> {
        env.storage().instance().get(&DataKey::Latest)
    }

    /// Whether a valid solvency attestation is on record (liabilities <= reserves at attest
    /// time). Absent an attestation this is false.
    pub fn is_solvent(env: Env) -> bool {
        match env.storage().instance().get::<_, Attestation>(&DataKey::Latest) {
            Some(a) => a.liabilities <= a.reserves,
            None => false,
        }
    }

    pub fn pool(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Pool).unwrap()
    }
    pub fn verifier(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Verifier).unwrap()
    }
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// 32-byte big-endian field-element encoding of a non-negative i128 (same as the pool),
    /// so the on-chain declared-liabilities public input matches the circuit's integer.
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
}

#[cfg(test)]
mod test;

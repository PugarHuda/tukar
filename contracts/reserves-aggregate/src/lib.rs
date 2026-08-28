#![no_std]

//! Tukar VOLUNTARY proof-of-reserves — a REAL, no-redeploy solvency signal built by
//! REUSING the already-deployed aggregate-disclosure verifier (no new circuit, no new
//! ceremony). Additive and read-only over the live pool (touches none of the 8 live
//! contracts).
//!
//! WHY this exists next to the full-pool reserves contract (contracts/reserves): the
//! full-pool proof needs ALL depositors' note openings at once, which Tukar cannot hold
//! (the notes are depositor-held — that IS the privacy property). The voluntary
//! alternative: each depositor proves a sum over THEIR OWN notes into a shared reserves
//! round using the EXISTING aggregate-disclosure circuit (prove sum <= cap without
//! revealing any amount). We set the circuit's `cap` to the depositor's `disclosed_sum`,
//! so the proof binds "these notes total AT MOST disclosed_sum". The contract accumulates
//! disclosed_sum into a running proven-liabilities total and compares it against the live
//! pool balance. The result is a real, growing, honest solvency signal: "proven
//! liabilities $Y across M of N notes, $Y <= balance", with ZERO redeploy of the live pool.
//!
//! Binding discipline (identical to the pool's `disclose_aggregate`): the public-input
//! vector is rebuilt on-chain in the exact circuit order
//! `[commitments(5), active(5), cap, auditContextHash, ctxNonce]`; every commitment is
//! canonicalised; every ACTIVE slot's commitment must be a known on-chain deposit (checked
//! cross-contract against the live pool); and each covered commitment is counted at most
//! once per round (no double-count).
//!
//! ponytail: this proves solvency for the COVERED SUBSET only (voluntary), so
//! proven_liabilities is a LOWER BOUND on the pool's true total liabilities — it grows as
//! more depositors attest but never claims to cover the whole pool. Each depositor's
//! contribution is an UPPER bound on their own notes (cap = disclosed_sum), which makes the
//! `proven_liabilities <= balance` check conservative (fail-safe) for the covered set. An
//! honest partial by design. Full-pool PoR without every opening needs the homomorphic-
//! accumulator upgrade (accumulate proven sums under a commitment, not a plain i128).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    symbol_short, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

const VERIFY: Symbol = symbol_short!("verify");
const BALANCE: Symbol = symbol_short!("balance");
// pool.is_commitment_known / pool.leaf_count exceed symbol_short!'s 9-char limit, so they
// are built with Symbol::new at the call site (must match the pool's exact fn names).

// Fixed circuit width of the reused aggregate-disclosure circuit AggregateDisclosure(5):
// each attestation covers 1..5 of a depositor's notes; unused slots are inactive padding.
const AGG_N: u32 = 5;
// Persistent TTL bounds for the per-round Covered markers (ledgers at ~5s): under ~1 day
// left (17_280) -> extend to ~31 days (535_680), the pool's leaf/root discipline, so a
// covered note cannot be re-counted after its marker is archived.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND: u32 = 535_680;
// Instance TTL bounds (round, nonce, totals live in the instance): under ~7 days left
// (120_960) -> extend to ~30 days (518_400). Bumped from every state-changing entrypoint.
const INSTANCE_TTL_THRESHOLD: u32 = 120_960;
const INSTANCE_TTL_EXTEND: u32 = 518_400;

/// Groth16 proof — identical layout to the verifier's / pool's `Groth16Proof`.
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
pub enum Error {
    NotOpen = 1,          // no reserves round is open (open_round not called)
    ProofRejected = 2,    // aggregate verifier rejected the proof
    UnknownCommitment = 3, // an active slot's commitment is not a live pool deposit
    AlreadyCovered = 4,   // a commitment was already counted in this round (no double-count)
    InvalidAmount = 5,    // disclosed_sum negative, >= 2^72 (circuit cap range), or above live custody
    BadIoCount = 6,       // wrong slot count / active flag not in {0,1} / no active slot
    NonCanonicalField = 7, // a caller field element is not its canonical mod-r encoding
}

#[contracttype]
enum DataKey {
    Admin,
    Pool,
    Verifier,
    Round,
    CtxNonce,
    ProvenLiabilities,
    CoveredCount,
    Covered(u32, BytesN<32>), // (round, commitment) -> () : per-round covered set
}

#[contract]
pub struct ReservesAggregate;

#[contractimpl]
impl ReservesAggregate {
    /// `admin` (the corridor operator) opens rounds and can re-point pool/verifier intent;
    /// `pool` is the live corridor pool this attests against; `aggregate_verifier` is the
    /// ALREADY-DEPLOYED BN254 verifier for the aggregate-disclosure circuit (reused as-is).
    pub fn __constructor(env: Env, admin: Address, pool: Address, aggregate_verifier: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Pool, &pool);
        s.set(&DataKey::Verifier, &aggregate_verifier);
        s.set(&DataKey::Round, &0u32);
    }

    /// Admin-only: open a fresh reserves round with a public context nonce. Depositors read
    /// `ctx_nonce()` and build their aggregate proof with this same `ctxNonce` (the circuit
    /// binds it into `auditContextHash = Poseidon(ctxNonce, commitments, active)`). Opening a
    /// round resets the running proven-liabilities total and covered count; the per-round
    /// covered set is keyed by round number, so old markers never collide with the new round.
    pub fn open_round(env: Env, ctx_nonce: BytesN<32>) -> u32 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        Self::bump_instance(&env);
        Self::require_canonical(&env, &ctx_nonce);
        let s = env.storage().instance();
        let round: u32 = s.get::<_, u32>(&DataKey::Round).unwrap_or(0) + 1;
        s.set(&DataKey::Round, &round);
        s.set(&DataKey::CtxNonce, &ctx_nonce);
        s.set(&DataKey::ProvenLiabilities, &0i128);
        s.set(&DataKey::CoveredCount, &0u32);
        round
    }

    /// A depositor VOLUNTARILY attests a partial sum over 1..5 of THEIR OWN notes into the
    /// open round. Permissionless (any depositor can strengthen the signal).
    ///
    /// - `commitments`/`active`: the AGG_N-wide slots; active slots are the depositor's real
    ///   notes, inactive slots are padding (commitment 0, active 0), exactly as the circuit
    ///   witness is built. `disclosed_sum` is the reporting cap the proof is tested against
    ///   (prove sum(active amounts) <= disclosed_sum), and the figure accumulated.
    /// - `audit_context`: the `auditContextHash = Poseidon(ctxNonce, commitments, active)` the
    ///   depositor computed off-chain; the proof binds it, so a wrong hash fails verification.
    ///
    /// Rebuilds the verifier public inputs on-chain in circuit order, requires every ACTIVE
    /// commitment to be a live pool deposit, rejects any commitment already covered this round,
    /// verifies against the reused aggregate verifier, then accumulates `disclosed_sum` and
    /// marks the active commitments covered.
    pub fn attest_partial(
        env: Env,
        proof: Groth16Proof,
        commitments: Vec<BytesN<32>>,
        active: Vec<u32>,
        disclosed_sum: i128,
        audit_context: BytesN<32>,
    ) -> i128 {
        let s = env.storage().instance();
        let ctx_nonce: BytesN<32> = match s.get(&DataKey::CtxNonce) {
            Some(n) => n,
            None => soroban_sdk::panic_with_error!(&env, Error::NotOpen),
        };
        let round: u32 = s.get(&DataKey::Round).unwrap();

        if commitments.len() != AGG_N || active.len() != AGG_N {
            soroban_sdk::panic_with_error!(&env, Error::BadIoCount);
        }
        // cap range: the circuit range-checks `cap` to 72 bits (holds a sum of 5 64-bit
        // amounts). Reject anything outside [0, 2^72) before it can silently wrap.
        if disclosed_sum < 0 || disclosed_sum >= (1i128 << 72) {
            soroban_sdk::panic_with_error!(&env, Error::InvalidAmount);
        }
        Self::bump_instance(&env);

        let pool: Address = s.get(&DataKey::Pool).unwrap();
        // The proof only shows sum(active notes) <= disclosed_sum, so disclosed_sum is caller-
        // chosen. Unbounded, one permissionless depositor could attest ~2^72 and flip
        // solvent_for_covered() false for the whole round. No single depositor's notes can
        // exceed what the pool custodies, so cap each contribution at the live pool balance.
        let balance: i128 = env.invoke_contract(&pool, &BALANCE, Vec::new(&env));
        if disclosed_sum > balance {
            soroban_sdk::panic_with_error!(&env, Error::InvalidAmount);
        }

        // BUILD the public-input vector FROM the passed slots in circuit order
        // [commitments(5), active(5), cap, auditContextHash, ctxNonce] — the SAME binding
        // discipline the pool's disclose_aggregate uses. Only ACTIVE slots must be real
        // deposits (inactive slots are padding the circuit ignores). Reject a commitment
        // already covered THIS round so a replay can't double-count liabilities.
        let mut pi = vec![&env];
        for c in commitments.iter() {
            Self::require_canonical(&env, &c);
            pi.push_back(Self::fr(&env, &c));
        }
        let mut any_active = false;
        for i in 0..AGG_N {
            let a = active.get(i).unwrap();
            if a != 0 && a != 1 {
                soroban_sdk::panic_with_error!(&env, Error::BadIoCount);
            }
            if a == 1 {
                any_active = true;
                let c = commitments.get(i).unwrap();
                let known: bool = env.invoke_contract(
                    &pool,
                    &Symbol::new(&env, "is_commitment_known"),
                    vec![&env, c.clone().into_val(&env)],
                );
                if !known {
                    soroban_sdk::panic_with_error!(&env, Error::UnknownCommitment);
                }
                if env.storage().persistent().has(&DataKey::Covered(round, c.clone())) {
                    soroban_sdk::panic_with_error!(&env, Error::AlreadyCovered);
                }
            }
            pi.push_back(Self::fr(&env, &Self::amount_bytes(&env, a as i128)));
        }
        if !any_active {
            soroban_sdk::panic_with_error!(&env, Error::BadIoCount);
        }
        // cap = disclosed_sum (bind "sum <= disclosed_sum"), then auditContextHash, ctxNonce.
        // audit_context is caller-supplied but PROOF-BOUND: the circuit enforces
        // auditContextHash === Poseidon(ctxNonce, commitments, active), and the contract fixes
        // ctxNonce to the open round's nonce, so a wrong hash simply fails verification. This
        // is exactly the pool's disclose_aggregate discipline (it doesn't recompute the hash
        // on-chain either — the proof is the binding).
        Self::require_canonical(&env, &audit_context);
        pi.push_back(Self::fr(&env, &Self::amount_bytes(&env, disclosed_sum)));
        pi.push_back(Self::fr(&env, &audit_context));
        pi.push_back(Self::fr(&env, &ctx_nonce));

        // Verify against the REUSED aggregate verifier. Trap+assert: the verifier traps on an
        // invalid proof, and we also assert its bool so a `false` return can't be a no-op.
        let verifier: Address = s.get(&DataKey::Verifier).unwrap();
        let ok: bool = env.invoke_contract(
            &verifier,
            &VERIFY,
            vec![&env, proof.into_val(&env), pi.into_val(&env)],
        );
        if !ok {
            soroban_sdk::panic_with_error!(&env, Error::ProofRejected);
        }

        // Proof verified — mark active commitments covered (dedup within the call too) and
        // accumulate the attested upper-bound liability.
        let mut newly = 0u32;
        for i in 0..AGG_N {
            if active.get(i).unwrap() == 1 {
                let key = DataKey::Covered(round, commitments.get(i).unwrap());
                if !env.storage().persistent().has(&key) {
                    env.storage().persistent().set(&key, &());
                    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
                    newly += 1;
                }
            }
        }
        let total: i128 = s.get::<_, i128>(&DataKey::ProvenLiabilities).unwrap_or(0) + disclosed_sum;
        let count: u32 = s.get::<_, u32>(&DataKey::CoveredCount).unwrap_or(0) + newly;
        s.set(&DataKey::ProvenLiabilities, &total);
        s.set(&DataKey::CoveredCount, &count);

        env.events().publish(
            (symbol_short!("attest"), round),
            (disclosed_sum, total, count),
        );
        total
    }

    // ---- views ----

    /// Running total of the VOLUNTARILY proven liabilities in the current round — a LOWER
    /// bound on the pool's true total liabilities (only the covered subset), each term an
    /// UPPER bound on that depositor's own notes.
    pub fn proven_liabilities(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::ProvenLiabilities).unwrap_or(0)
    }
    /// How many distinct notes have been covered by attestations this round (the M in M-of-N).
    pub fn covered_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::CoveredCount).unwrap_or(0)
    }
    /// The pool's total registered note count (the N in M-of-N), read cross-contract.
    pub fn pool_leaf_count(env: Env) -> u32 {
        let pool: Address = env.storage().instance().get(&DataKey::Pool).unwrap();
        env.invoke_contract(&pool, &Symbol::new(&env, "leaf_count"), Vec::new(&env))
    }
    /// The pool's live custody balance (USDC stroops), read cross-contract.
    pub fn pool_balance(env: Env) -> i128 {
        let pool: Address = env.storage().instance().get(&DataKey::Pool).unwrap();
        env.invoke_contract(&pool, &BALANCE, Vec::new(&env))
    }
    /// True when the proven (covered) liabilities are within live custody. Because each term
    /// is an upper bound on that depositor's notes, this is a conservative solvency signal for
    /// the covered subset — it does NOT assert whole-pool solvency (the honest partial).
    pub fn solvent_for_covered(env: Env) -> bool {
        Self::proven_liabilities(env.clone()) <= Self::pool_balance(env)
    }
    pub fn round(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Round).unwrap_or(0)
    }
    /// The current round's public context nonce, or None before the first `open_round`.
    pub fn ctx_nonce(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&DataKey::CtxNonce)
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

    // ---- helpers (identical discipline to the pool) ----

    /// Keep the contract instance + code alive: extend to INSTANCE_TTL_EXTEND once under
    /// INSTANCE_TTL_THRESHOLD ledgers remain. Called by every state-changing entrypoint.
    fn bump_instance(env: &Env) {
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
        Bn254Fr::from_bytes(b.clone())
    }

    /// Reject a caller field element whose 32 bytes are NOT the canonical (reduced-mod-r)
    /// encoding — the same guard the pool applies so equivalent encodings can't diverge.
    fn require_canonical(env: &Env, b: &BytesN<32>) {
        if Self::fr(env, b).to_bytes() != *b {
            soroban_sdk::panic_with_error!(env, Error::NonCanonicalField);
        }
    }

    /// 32-byte big-endian field encoding of a non-negative i128 (matches the pool's
    /// `amount_bytes`), so the on-chain cap/active public inputs match the circuit integers.
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

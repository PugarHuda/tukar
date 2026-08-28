#![no_std]

//! Tukar pool-timelock — a PARALLEL, preview-track pool (built on the pool-enforced track)
//! that puts an ADMIN TIMELOCK on the compliance-critical setters. Identical to
//! `contracts/pool-enforced/` EXCEPT the privileged setters `set_asp_root`, `set_deny_list`,
//! `set_fx_oracle`, `set_auditor`, `set_policy_registry` are NO LONGER instant: each is now a
//! two-step propose -> mandatory delay -> execute, admin-gated, with a cancel. Deployed to its
//! OWN address; the 8 live contracts, the live pool, and the deployed pool-enforced /
//! pool-accumulator addresses are untouched.
//!
//! **Why this exists (the threat closed).** docs/THREAT_MODEL.md §3.5 (admin-key compromise): a
//! compromised admin key could re-point the ASP allow-root or the deny-list — who may deposit —
//! or the FX oracle, INSTANTLY, so a stolen key is an instant compliance bypass. Soroban has no
//! native contract-admin multisig, so the contract-level control is a TIMELOCK: a proposed change
//! cannot take effect until a mandatory delay elapses, giving monitoring (every propose emits an
//! event, §5) time to detect an unexpected policy change and `cancel` it. It pairs with running
//! the admin as a Stellar classic MULTISIG account (an account-config step, not code).
//!
//! **Design.** `DELAY` (seconds) is stored at construction. `propose_set_X(value)` (admin) stores
//! the pending change keyed by the setter with `eta = ledger.timestamp() + DELAY` and emits an
//! event; only one pending change per setter (a re-propose overwrites, still with a full delay).
//! `execute_set_X()` (admin) requires a pending change AND `ledger.timestamp() >= eta`, then applies
//! it and clears the slot — too-early is `TimelockNotReady` (#20), nothing-pending is `TimelockEmpty`
//! (#21). `cancel_set_X()` (admin) clears a pending change. Views `pending_set_X() -> Option<(value,
//! eta)>` and `timelock_delay()`. The non-privileged paths (deposit/withdraw/transfer/disclose/
//! register_root_verified), per-corridor cap enforcement, and `import_state` are byte-for-byte the
//! pool-enforced behaviour. `upgrade` (a code swap is the strongest admin power there is) and
//! `set_admin` go through the SAME propose -> delay -> execute path (`propose_upgrade` /
//! `execute_upgrade`, `propose_set_admin` / `execute_set_admin`), so a stolen admin key can no
//! longer swap the code or hand itself off instantly. `import_state` stays a direct admin call
//! (import is already one-shot + virgin-only), and the additive disclosure-verifier setters
//! (`set_threshold_verifier`/`set_aggregate_verifier`/`set_range_verifier`) stay direct: they only
//! enable extra read-only regulator disclosure proofs, they are not allow/deny controls and move no
//! funds. For the testnet demo `DELAY` is set SHORT so the delay is demonstrable end-to-end; a
//! production corridor uses a long delay (e.g. 24-48h).
//!
//! The stateful corridor contract that orchestrates the three ZK
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
//! demo uses the SAC of real testnet USDC — issuer `GC7SWGHR…` — not a stand-in).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine},
    symbol_short, token::TokenClient, vec, Address, BytesN, Env, IntoVal, Symbol, Vec,
};

mod poseidon;
mod poseidon_constants;

const VERIFY: Symbol = symbol_short!("verify");
const DENY_LEN: u32 = 8;

/// The mandatory timelock delay (seconds) between `propose_*` and `execute_*` on the gated
/// setters, written to storage at construction and read via `timelock_delay()`.
///
/// It is a compile-time const, not a constructor argument, because Soroban caps a contract
/// function at 10 inputs and the pool's `__constructor` already uses all 10 (admin, token, the
/// four verifiers, initial_root, asp_root, deny_list, fx_oracle) — so DELAY cannot be an 11th
/// constructor arg. Change this per deployment. This is a SHORT value so the demo can prove the
/// after-eta execute path end-to-end; a production corridor uses a long delay (e.g. 24-48h =
/// 86_400..172_800), which the monitoring window (docs/THREAT_MODEL.md §5) is sized against.
pub const TIMELOCK_DELAY: u64 = 60;
// Persistent-state TTL bounds: when a tree leaf / root entry's remaining TTL falls
// below the threshold (~1 day), extend it to ~31 days, so a long-lived accumulator
// keeps its leaves/roots readable without per-entry maintenance from the caller.
const TTL_THRESHOLD: u32 = 17_280;
const TTL_EXTEND: u32 = 535_680;
// Instance TTL bounds. The instance (plus code) holds every setter, the current root and the
// leaf count, so if it is archived the pool stops. At ~5s per ledger: when under ~7 days
// (120_960 ledgers) remain, extend to ~30 days (518_400). Bumped from every state-changing
// entrypoint, so normal use keeps the instance alive without separate maintenance.
const INSTANCE_TTL_THRESHOLD: u32 = 120_960;
const INSTANCE_TTL_EXTEND: u32 = 518_400;

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
    ProofRejected = 7,
    TreeFull = 8,
    LeafAlreadyInserted = 9,
    DuplicateCommitment = 10,
    FxUnavailable = 11,
    SlippageExceeded = 12,
    BadIoCount = 13,
    NonCanonicalField = 14,
    UnknownAuditRequest = 15,
    PolicyExceeded = 16,
    AlreadyMigrated = 17,
    TimelockNotReady = 20, // execute called before the pending change's eta elapsed
    TimelockEmpty = 21,    // execute/cancel called with no pending change for that setter
    PolicyRequired = 22,   // a policy registry is set but the withdraw named no corridor
}

// The transfer/withdraw JoinSplit is fixed at 2 inputs and 2 outputs (Transfer(10,2,2)).
// The Groth16 verifier only sees a FLAT public-input vector, so the contract MUST pin
// how many of those are nullifiers vs. commitments — otherwise a caller could shift the
// boundary (e.g. 1 nullifier + 3 commitments instead of 2+2): the flat vector is
// identical so the same proof verifies, but only 1 nullifier gets spent and the second
// input note stays unspent -> double-spendable. Pinning the counts closes that.
const TRANSFER_NINS: u32 = 2;
const TRANSFER_NOUTS: u32 = 2;
const AGG_N: u32 = 5; // MAX notes aggregated by the variable-count portfolio-disclosure circuit

// USDC SAC has 7 decimals, so 1 whole USDC = 10^7 stroops. The off-ramp quote works
// in whole-USDC units (what the receiver sees), so the withdraw gate converts the
// released stroop amount to whole USDC before pricing it against the oracle.
const USDC_STROOPS: i128 = 10_000_000;
// Max age (seconds) of a Reflector price before the pool treats the feed as
// unavailable. Mirrors the frontend's 1-hour bound so display and on-chain
// settlement agree; the Reflector testnet feed updates every ~2 min, so a healthy
// feed passes comfortably. A frozen-but-positive stale price must NOT be used as a
// live rate by the settlement gate — so staleness fails closed (FxUnavailable).
const FX_MAX_STALENESS: u64 = 3600;
// The withdraw SETTLEMENT gate prices against the MEDIAN of the last N Reflector
// records, not a single spot price — so a transient manipulation or glitch of one
// record can't move the floor (the median of N is robust to an outlier). FX_MIN_RECORDS
// is the minimum the feed must return, so a thin feed can't silently degrade the median
// back to a single spot read; below it the gate fails closed (FxUnavailable).
const FX_GATE_RECORDS: u32 = 5;
const FX_MIN_RECORDS: u32 = 3;

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
    LeafCount,        // number of leaves inserted into the Merkle tree
    Leaf(u32),        // the commitment at tree leaf index i (durable, ordered)
    Inserted(BytesN<32>), // commitments already inserted as a leaf (insert-once guard)
    Root(BytesN<32>),
    Nullifier(BytesN<32>),
    Commitment(BytesN<32>),
    FxOracle,         // Reflector SEP-40 oracle address (USD-base FX feed)
    ThresholdVerifier, // BN254 verifier for the threshold (range) disclosure circuit
    AggregateVerifier, // BN254 verifier for the aggregate (portfolio) disclosure circuit
    RangeVerifier,     // BN254 verifier for the two-sided range (band) disclosure circuit
    Auditor,           // the role allowed to register aggregate audit requests
    AuditRequest(BytesN<32>), // a registered aggregate audit-request hash (regulator-issued)
    PolicyRegistry,    // the per-corridor policy registry this pool enforces caps against
    Migrated,          // one-shot flag: set once import_state has run, so it can never run again
    TimelockDelay,     // mandatory delay (seconds) between propose and execute on the gated setters
    Pending(Setter),   // the single pending change for a setter: (new value, eta) — see Setter/PendingValue
}

/// The compliance-critical setters that are behind the timelock. Doubles as the key that
/// pins a setter's single pending change (`DataKey::Pending(Setter)`).
#[contracttype]
#[derive(Clone)]
pub enum Setter {
    AspRoot,
    DenyList,
    FxOracle,
    Auditor,
    PolicyRegistry,
    Upgrade, // the contract's own WASM (update_current_contract_wasm) - a code swap
    Admin,   // the admin role itself (set_admin)
}

/// A proposed new value for a timelocked setter, stored alongside its eta until executed.
/// One variant per gated setter, so a single `DataKey::Pending(Setter)` slot carries the
/// correctly-typed value and `execute` applies it to the same storage the direct setter used.
#[contracttype]
#[derive(Clone)]
pub enum PendingValue {
    AspRoot(BytesN<32>),
    DenyList(Vec<BytesN<32>>),
    FxOracle(Address),
    Auditor(Address),
    PolicyRegistry(Address),
    Upgrade(BytesN<32>), // new WASM hash (must already be uploaded)
    Admin(Address),
}

// ---- Reflector SEP-40 oracle interface (the subset the pool calls) ----
// Mirrors the partner contract's types so the pool can invoke it cross-contract.
#[contracttype]
#[derive(Clone)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

// ---- policy-registry interface (the subset the pool reads) ----
// Mirrors contracts/policy-registry PolicyEntry so the pool can invoke policy(Symbol)
// cross-contract and read the per-corridor cap. Only cap_usdc is load-bearing here.
#[contracttype]
#[derive(Clone)]
pub struct PolicyEntry {
    pub cap_usdc: i128,
    pub disclosure: u32,
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
        fx_oracle: Address,
    ) {
        if deny_list.len() != DENY_LEN {
            soroban_sdk::panic_with_error!(&env, PoolError::BadDenyList);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TimelockDelay, &TIMELOCK_DELAY);
        s.set(&DataKey::Auditor, &admin); // auditor role defaults to admin; admin can reassign it
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::TransferVerifier, &transfer_verifier);
        s.set(&DataKey::ComplianceVerifier, &compliance_verifier);
        s.set(&DataKey::DisclosureVerifier, &disclosure_verifier);
        s.set(&DataKey::UpdateVerifier, &update_verifier);
        s.set(&DataKey::AspRoot, &asp_root);
        s.set(&DataKey::DenyList, &deny_list);
        s.set(&DataKey::CurrentRoot, &initial_root);
        s.set(&DataKey::Count, &0u32);
        s.set(&DataKey::FxOracle, &fx_oracle);
        env.storage().persistent().set(&DataKey::Root(initial_root), &());
    }

    /// TIMELOCKED (admin): propose a new Reflector FX oracle address. Takes effect only after
    /// `execute_set_fx_oracle` past the delay. See the module header for the propose/execute/cancel flow.
    pub fn propose_set_fx_oracle(env: Env, oracle: Address) {
        Self::propose(&env, Setter::FxOracle, PendingValue::FxOracle(oracle), symbol_short!("fxoracle"));
    }
    /// TIMELOCKED (admin): apply the pending FX-oracle change once its eta has elapsed.
    pub fn execute_set_fx_oracle(env: Env) {
        let v = Self::take_ready(&env, Setter::FxOracle);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("fxoracle")), ());
    }
    /// TIMELOCKED (admin): drop the pending FX-oracle change.
    pub fn cancel_set_fx_oracle(env: Env) {
        Self::cancel(&env, Setter::FxOracle, symbol_short!("fxoracle"));
    }
    /// The pending FX-oracle change (oracle, eta), if one is queued.
    pub fn pending_set_fx_oracle(env: Env) -> Option<(Address, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::FxOracle)) {
            Some((PendingValue::FxOracle(a), eta)) => Some((a, eta)),
            _ => None,
        }
    }

    /// The Reflector FX oracle this pool reads for off-ramp quotes.
    pub fn fx_oracle(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FxOracle).unwrap()
    }

    /// TIMELOCKED (admin): propose the per-corridor policy registry this pool enforces caps against.
    /// When executed and set, `withdraw` reads the corridor's cap_usdc from it and rejects an over-cap
    /// withdraw. Behind the timelock so a compromised admin can't instantly loosen (or forge) the caps.
    pub fn propose_set_policy_registry(env: Env, registry: Address) {
        Self::propose(&env, Setter::PolicyRegistry, PendingValue::PolicyRegistry(registry), symbol_short!("policyreg"));
    }
    /// TIMELOCKED (admin): apply the pending policy-registry change once its eta has elapsed.
    pub fn execute_set_policy_registry(env: Env) {
        let v = Self::take_ready(&env, Setter::PolicyRegistry);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("policyreg")), ());
    }
    /// TIMELOCKED (admin): drop the pending policy-registry change.
    pub fn cancel_set_policy_registry(env: Env) {
        Self::cancel(&env, Setter::PolicyRegistry, symbol_short!("policyreg"));
    }
    /// The pending policy-registry change (registry, eta), if one is queued.
    pub fn pending_set_policy_registry(env: Env) -> Option<(Address, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::PolicyRegistry)) {
            Some((PendingValue::PolicyRegistry(a), eta)) => Some((a, eta)),
            _ => None,
        }
    }

    /// The per-corridor policy registry this pool enforces, if one has been set.
    pub fn policy_registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PolicyRegistry)
    }

    /// TIMELOCKED (admin): propose hot-swapping this contract's own WASM in place (same
    /// address, same state). A code swap is the strongest admin power there is (it can rewrite
    /// every other control), so it takes the same propose -> delay -> execute path as the
    /// compliance setters; there is deliberately NO instant upgrade entrypoint. The hash must
    /// already be uploaded (`stellar contract upload`) by the time `execute_upgrade` runs.
    pub fn propose_upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::propose(&env, Setter::Upgrade, PendingValue::Upgrade(new_wasm_hash), symbol_short!("upgrade"));
    }
    /// TIMELOCKED (admin): apply the pending WASM swap once its eta has elapsed.
    pub fn execute_upgrade(env: Env) {
        let v = Self::take_ready(&env, Setter::Upgrade);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("upgrade")), ());
    }
    /// TIMELOCKED (admin): drop the pending WASM swap.
    pub fn cancel_upgrade(env: Env) {
        Self::cancel(&env, Setter::Upgrade, symbol_short!("upgrade"));
    }
    /// The pending WASM swap (new_wasm_hash, eta), if one is queued.
    pub fn pending_upgrade(env: Env) -> Option<(BytesN<32>, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::Upgrade)) {
            Some((PendingValue::Upgrade(h), eta)) => Some((h, eta)),
            _ => None,
        }
    }

    /// TIMELOCKED (admin): propose handing the admin role to `new_admin`. Behind the timelock
    /// so a stolen key cannot instantly lock the operator out; the delay is the window to cancel.
    pub fn propose_set_admin(env: Env, new_admin: Address) {
        Self::propose(&env, Setter::Admin, PendingValue::Admin(new_admin), symbol_short!("admin"));
    }
    /// TIMELOCKED (admin): apply the pending admin change once its eta has elapsed.
    pub fn execute_set_admin(env: Env) {
        let v = Self::take_ready(&env, Setter::Admin);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("admin")), ());
    }
    /// TIMELOCKED (admin): drop the pending admin change.
    pub fn cancel_set_admin(env: Env) {
        Self::cancel(&env, Setter::Admin, symbol_short!("admin"));
    }
    /// The pending admin change (new_admin, eta), if one is queued.
    pub fn pending_set_admin(env: Env) -> Option<(Address, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::Admin)) {
            Some((PendingValue::Admin(a), eta)) => Some((a, eta)),
            _ => None,
        }
    }
    /// The current admin (the only key that can propose/execute/cancel timelocked changes).
    pub fn admin(env: Env) -> Address {
        Self::admin_addr(&env)
    }

    /// Admin-only, ONE-TIME state import — the lossless-migration entrypoint. The LIVE pool
    /// has NO upgrade hook and NO import-state, so a lossless upgrade means deploying THIS pool
    /// fresh and re-inserting the source pool's shielded state here, byte-for-byte, before the
    /// pool takes any deposits. Reproduces exactly the storage `contracts/pool/` and this pool
    /// build with normal operation (see the field-by-field mapping below), so `leaf_count()` and
    /// `current_root()` match the source and every migrated note keeps its spend status.
    ///
    /// **CORRECTNESS — nullifier completeness (READ THIS).** The spent-nullifier set is the
    /// load-bearing input. The pool's `withdraw`/`transfer` events publish only
    /// `(withdraw, recipient)->amount` / `(transfer,)->root` — they DO NOT publish nullifiers —
    /// and there is no view that enumerates the nullifier set (only `is_nullifier_used(n)`, which
    /// needs `n` up front). So the spent-nullifier set CANNOT be reconstructed from on-chain data
    /// alone; the caller MUST supply the COMPLETE set from the operator's own records. If any
    /// spent nullifier is omitted, its already-spent note becomes spendable again on this pool
    /// (double-spend). This function is correct ONLY when `nullifiers` is complete; it cannot
    /// verify completeness on-chain, so completeness is the caller's responsibility.
    ///
    /// One-shot + virgin: refuses if `Migrated` is already set OR the pool already has any leaves
    /// or commitments (`AlreadyMigrated`), so import is always the FIRST state-changing call and
    /// can never run twice. Sets `Migrated` last.
    ///
    /// Note: only the source's CURRENT root is imported (not the full historical-root set), and
    /// all source leaves are imported, so any note re-proves membership against `current_root()`
    /// via the reconstructable `leaves()` list — the same discipline `register_root_verified`
    /// already relies on. Pending change-note outputs that were recorded but never registered as
    /// leaves are out of scope (import takes the registered tree, its root, and the nullifier set).
    pub fn import_state(
        env: Env,
        leaves: Vec<BytesN<32>>,
        root: BytesN<32>,
        nullifiers: Vec<BytesN<32>>,
        asp_root: BytesN<32>,
        deny_list: Vec<BytesN<32>>,
    ) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        // One-shot: never run twice, and only into a virgin pool (no prior deposits/registers),
        // so migrated leaf indices are exactly [0..leaves.len()) and nothing is imported on top
        // of existing state.
        let already = env.storage().instance().has(&DataKey::Migrated);
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        let lc: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        if already || count != 0 || lc != 0 {
            soroban_sdk::panic_with_error!(&env, PoolError::AlreadyMigrated);
        }
        if deny_list.len() != DENY_LEN {
            soroban_sdk::panic_with_error!(&env, PoolError::BadDenyList);
        }
        if leaves.len() > 1u32 << 10 {
            soroban_sdk::panic_with_error!(&env, PoolError::TreeFull);
        }
        Self::bump_instance(&env);
        // Canonical encodings only, exactly as the normal write paths require — so the migrated
        // storage keys are byte-identical to what a live deposit/withdraw would have written and
        // a non-canonical re-encoding can't smuggle a duplicate key past the double-spend guard.
        Self::require_canonical(&env, &root);
        // Re-insert each leaf at its source index, rebuilding the tree state (leaves + count +
        // backing commitment + insert-once guard) exactly as `deposit`+`register_root_verified`
        // would have left it.
        let mut i = 0u32;
        for leaf in leaves.iter() {
            Self::require_canonical(&env, &leaf);
            // A repeated leaf would take a second tree slot backed by ONE commitment
            // (record_commitment is idempotent, so it would not notice) - reject it.
            if env.storage().persistent().has(&DataKey::Commitment(leaf.clone())) {
                soroban_sdk::panic_with_error!(&env, PoolError::DuplicateCommitment);
            }
            Self::record_commitment(&env, &leaf); // Commitment(leaf) + Count bump + TTL (backing)
            let ins_key = DataKey::Inserted(leaf.clone());
            env.storage().persistent().set(&ins_key, &()); // insert-once guard
            env.storage().persistent().set(&DataKey::Leaf(i), &leaf); // ordered leaf list
            env.storage().persistent().extend_ttl(&DataKey::Leaf(i), TTL_THRESHOLD, TTL_EXTEND);
            env.storage().persistent().extend_ttl(&ins_key, TTL_THRESHOLD, TTL_EXTEND);
            i += 1;
        }
        env.storage().instance().set(&DataKey::LeafCount, &i);
        // Current root: register it known and make it current, so notes verify against it.
        env.storage().persistent().set(&DataKey::Root(root.clone()), &());
        env.storage().persistent().extend_ttl(&DataKey::Root(root.clone()), TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().set(&DataKey::CurrentRoot, &root);
        // Mark every spent nullifier used (completeness is the caller's responsibility, above).
        // Canonical-check each (as the normal transfer path does before spending), then reuse
        // spend_nullifiers so duplicates are rejected and the TTL matches the normal path.
        for n in nullifiers.iter() {
            Self::require_canonical(&env, &n);
        }
        Self::spend_nullifiers(&env, &nullifiers);
        // Policy state.
        env.storage().instance().set(&DataKey::AspRoot, &asp_root);
        env.storage().instance().set(&DataKey::DenyList, &deny_list);
        // Seal: import can never run again.
        env.storage().instance().set(&DataKey::Migrated, &true);
        env.events().publish((symbol_short!("migrated"), i), root);
    }

    /// Whether the one-time `import_state` migration has already run on this pool.
    pub fn is_migrated(env: Env) -> bool {
        env.storage().instance().has(&DataKey::Migrated)
    }

    /// Admin-only: set (or replace) the threshold (range) disclosure verifier. Kept a
    /// setter rather than a constructor arg so the range-disclosure feature can be
    /// enabled additively on an already-deployed pool without changing constructor arity.
    pub fn set_threshold_verifier(env: Env, verifier: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        Self::bump_instance(&env);
        env.storage().instance().set(&DataKey::ThresholdVerifier, &verifier);
    }

    /// The threshold (range) disclosure verifier, if one has been set.
    pub fn threshold_verifier(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::ThresholdVerifier)
    }

    /// Admin-only: set (or replace) the aggregate (portfolio) disclosure verifier.
    /// Additive, like the threshold verifier — no constructor-arity change.
    pub fn set_aggregate_verifier(env: Env, verifier: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        Self::bump_instance(&env);
        env.storage().instance().set(&DataKey::AggregateVerifier, &verifier);
    }

    /// The aggregate (portfolio) disclosure verifier, if one has been set.
    pub fn aggregate_verifier(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::AggregateVerifier)
    }

    /// TIMELOCKED (admin): propose the AUDITOR role — the party allowed to register aggregate audit
    /// requests. Defaults to the admin. Behind the timelock so the disclosure-completeness gate can't be
    /// re-pointed instantly by a stolen key.
    pub fn propose_set_auditor(env: Env, auditor: Address) {
        Self::propose(&env, Setter::Auditor, PendingValue::Auditor(auditor), symbol_short!("auditor"));
    }
    /// TIMELOCKED (admin): apply the pending auditor change once its eta has elapsed.
    pub fn execute_set_auditor(env: Env) {
        let v = Self::take_ready(&env, Setter::Auditor);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("auditor")), ());
    }
    /// TIMELOCKED (admin): drop the pending auditor change.
    pub fn cancel_set_auditor(env: Env) {
        Self::cancel(&env, Setter::Auditor, symbol_short!("auditor"));
    }
    /// The pending auditor change (auditor, eta), if one is queued.
    pub fn pending_set_auditor(env: Env) -> Option<(Address, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::Auditor)) {
            Some((PendingValue::Auditor(a), eta)) => Some((a, eta)),
            _ => None,
        }
    }

    /// The current auditor role.
    pub fn auditor(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Auditor).unwrap()
    }

    /// Auditor-only: REGISTER an aggregate audit request. `audit_context_hash` is the
    /// Poseidon(ctxNonce, commitments, active) the regulator computed for the FULL required
    /// set of a holder's payments. `disclose_aggregate` then only accepts a proof whose
    /// auditContextHash is registered here — so a holder can't mint their own hash for a
    /// cherry-picked subset: completeness is enforced ON-CHAIN (the auditor pins the set,
    /// the circuit binds the hash to it). TTL-extended so a request stays valid a while.
    pub fn register_audit_request(env: Env, audit_context_hash: BytesN<32>) {
        let auditor: Address = env.storage().instance().get(&DataKey::Auditor).unwrap();
        auditor.require_auth();
        Self::bump_instance(&env);
        Self::require_canonical(&env, &audit_context_hash);
        let key = DataKey::AuditRequest(audit_context_hash);
        env.storage().persistent().set(&key, &());
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    }

    /// Whether an aggregate audit-request hash has been registered by the auditor.
    pub fn is_audit_request(env: Env, audit_context_hash: BytesN<32>) -> bool {
        env.storage().persistent().has(&DataKey::AuditRequest(audit_context_hash))
    }

    /// Admin-only: set (or replace) the two-sided range (band) disclosure verifier.
    pub fn set_range_verifier(env: Env, verifier: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        Self::bump_instance(&env);
        env.storage().instance().set(&DataKey::RangeVerifier, &verifier);
    }

    /// The two-sided range (band) disclosure verifier, if one has been set.
    pub fn range_verifier(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::RangeVerifier)
    }

    /// Admin-only: replace the ASP allow-list root (the allow-list "policy
    /// registry"). Lets the compliance policy evolve WITHOUT redeploying the pool —
    /// the configurable-policy property Stellar's Confidential Tokens expose, here on
    /// the privacy-pool tier. The compliance circuit reads `aspRoot` as a public
    /// input the pool builds from storage, so this re-points the membership check;
    /// the operator must publish a matching allow-list witness for provers.
    pub fn propose_set_asp_root(env: Env, asp_root: BytesN<32>) {
        Self::propose(&env, Setter::AspRoot, PendingValue::AspRoot(asp_root), symbol_short!("asproot"));
    }
    /// TIMELOCKED (admin): apply the pending ASP-root change once its eta has elapsed.
    pub fn execute_set_asp_root(env: Env) {
        let v = Self::take_ready(&env, Setter::AspRoot);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("asproot")), ());
    }
    /// TIMELOCKED (admin): drop the pending ASP-root change.
    pub fn cancel_set_asp_root(env: Env) {
        Self::cancel(&env, Setter::AspRoot, symbol_short!("asproot"));
    }
    /// The pending ASP-root change (asp_root, eta), if one is queued.
    pub fn pending_set_asp_root(env: Env) -> Option<(BytesN<32>, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::AspRoot)) {
            Some((PendingValue::AspRoot(r), eta)) => Some((r, eta)),
            _ => None,
        }
    }

    /// TIMELOCKED (admin): propose replacing the deny-list (the block-list "identity registry").
    /// Must keep the fixed length the circuit expects (`DENY_LEN` public inputs) — validated at
    /// propose time so a malformed list is rejected up front, not after the delay. Executing
    /// re-points the non-membership check without a redeploy.
    pub fn propose_set_deny_list(env: Env, deny_list: Vec<BytesN<32>>) {
        if deny_list.len() != DENY_LEN {
            soroban_sdk::panic_with_error!(&env, PoolError::BadDenyList);
        }
        Self::propose(&env, Setter::DenyList, PendingValue::DenyList(deny_list), symbol_short!("denylist"));
    }
    /// TIMELOCKED (admin): apply the pending deny-list change once its eta has elapsed.
    pub fn execute_set_deny_list(env: Env) {
        let v = Self::take_ready(&env, Setter::DenyList);
        Self::apply(&env, v);
        env.events().publish((symbol_short!("tl_exec"), symbol_short!("denylist")), ());
    }
    /// TIMELOCKED (admin): drop the pending deny-list change.
    pub fn cancel_set_deny_list(env: Env) {
        Self::cancel(&env, Setter::DenyList, symbol_short!("denylist"));
    }
    /// The pending deny-list change (deny_list, eta), if one is queued.
    pub fn pending_set_deny_list(env: Env) -> Option<(Vec<BytesN<32>>, u64)> {
        match env.storage().instance().get::<_, (PendingValue, u64)>(&DataKey::Pending(Setter::DenyList)) {
            Some((PendingValue::DenyList(d), eta)) => Some((d, eta)),
            _ => None,
        }
    }

    /// The mandatory timelock delay (seconds) between propose and execute on the gated setters.
    pub fn timelock_delay(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::TimelockDelay).unwrap()
    }

    /// The current ASP allow-list root — so a client can confirm its membership
    /// witness matches the live policy before proving.
    pub fn asp_root(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::AspRoot).unwrap()
    }

    /// The current deny-list — so a client builds the compliance proof's public
    /// inputs from the LIVE policy, not a stale hardcode.
    pub fn deny_list(env: Env) -> Vec<BytesN<32>> {
        env.storage().instance().get(&DataKey::DenyList).unwrap()
    }

    /// Off-ramp quote, computed ON-CHAIN by reading the Reflector SEP-40 oracle
    /// (contract-to-contract composability). Given a `symbol` the oracle carries
    /// (e.g. "MXN", base = USD) and a USDC amount (whole units), returns the local
    /// fiat the receiver would get at the live on-chain FX rate. The oracle reports
    /// the USD value of 1 local unit scaled by `decimals`, so:
    ///   local = usdc * 10^decimals / price.
    /// This is the figure the receiver panel reveals — derived by the pool reading
    /// Reflector, not by a client-side hardcode. It does NOT gate token release
    /// (`withdraw` settles in USDC and never depends on the oracle being live).
    pub fn offramp_quote(env: Env, symbol: Symbol, usdc_amount: i128) -> i128 {
        // Bound the input to the same 64-bit range as a deposit (real corridor
        // amounts are far smaller). Keeps the math well inside i128 regardless of
        // what the oracle reports, and gives a typed error instead of a trap.
        if usdc_amount < 0 || usdc_amount >= (1i128 << 64) {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        Self::quote_local(&env, symbol, usdc_amount)
    }

    /// Manipulation-resistant off-ramp quote: like `offramp_quote`, but priced at the
    /// MEDIAN of the last `records` Reflector records — exactly what the withdraw
    /// settlement gate enforces. Exposed so a client can compute its min-receive floor
    /// on the SAME basis the gate uses (not a spot price that could diverge). Read-only.
    pub fn offramp_quote_twap(env: Env, symbol: Symbol, usdc_amount: i128, records: u32) -> i128 {
        if usdc_amount < 0 || usdc_amount >= (1i128 << 64) {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        Self::quote_local_median(&env, symbol, usdc_amount, records)
    }

    /// Local fiat for `usdc_amount` whole USDC at the live Reflector SPOT rate, read
    /// ON-CHAIN (cross-contract). Used by the DISPLAY quote (`offramp_quote`). A
    /// stale/absent feed or an overflow yields a typed FxUnavailable, never a VM trap,
    /// so the display degrades gracefully. The load-bearing settlement gate uses the
    /// median path (`quote_local_median`) instead, for manipulation resistance.
    fn quote_local(env: &Env, symbol: Symbol, usdc_amount: i128) -> i128 {
        let oracle: Address = env.storage().instance().get(&DataKey::FxOracle).unwrap();
        let asset = Asset::Other(symbol);
        // Reflector: lastprice(asset) -> Option<PriceData>.
        let pd: Option<PriceData> = env.invoke_contract(
            &oracle,
            &Symbol::new(env, "lastprice"),
            vec![env, asset.into_val(env)],
        );
        // Reject an ABSENT feed (None), a non-positive price, AND a STALE price: a
        // frozen-but-positive price must not pass as a live rate. now - timestamp is
        // saturating so a price stamped at/after the ledger clock counts as fresh.
        let now = env.ledger().timestamp();
        let pd = match pd {
            Some(p) if p.price > 0 && now.saturating_sub(p.timestamp) <= FX_MAX_STALENESS => p,
            _ => soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable),
        };
        Self::price_to_local(env, &oracle, usdc_amount, pd.price)
    }

    /// Manipulation-resistant rate for the SETTLEMENT gate: read the last `records`
    /// Reflector records and price at their MEDIAN, so a single manipulated/glitched
    /// record can't move the floor (median of N is robust to one outlier). The NEWEST
    /// record must still be fresh (<= FX_MAX_STALENESS), so a stalled feed fails closed;
    /// the feed must return at least FX_MIN_RECORDS, so a thin feed can't degrade the
    /// median back to spot. Absent feed / too-few records / overflow -> FxUnavailable.
    fn quote_local_median(env: &Env, symbol: Symbol, usdc_amount: i128, records: u32) -> i128 {
        let oracle: Address = env.storage().instance().get(&DataKey::FxOracle).unwrap();
        let asset = Asset::Other(symbol);
        // Reflector: prices(asset, records) -> Option<Vec<PriceData>> (newest first).
        let pv: Option<Vec<PriceData>> = env.invoke_contract(
            &oracle,
            &Symbol::new(env, "prices"),
            vec![env, asset.into_val(env), records.into_val(env)],
        );
        let pv = match pv {
            Some(v) if v.len() >= FX_MIN_RECORDS => v,
            _ => soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable),
        };
        // EVERY record must be fresh (not just the newest): otherwise an oracle could
        // return one fresh record plus stale-but-positive interior records that still
        // enter the median. Requiring each record <= FX_MAX_STALENESS closes that gap
        // (honest feeds return contiguous recent records, all well within the window).
        let now = env.ledger().timestamp();
        for p in pv.iter() {
            if p.timestamp == 0 || now.saturating_sub(p.timestamp) > FX_MAX_STALENESS {
                soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable);
            }
        }
        let median = Self::median_price(env, &pv);
        Self::price_to_local(env, &oracle, usdc_amount, median)
    }

    /// Median of the record prices (each must be > 0, else FxUnavailable). Insertion-
    /// sorts a small Vec (N ~ 5, well within the CPU budget) and takes the middle; for
    /// an even count this picks the upper-middle, which only makes the floor slightly
    /// STRICTER — fund-safe (the gate can over-protect, never under-protect).
    fn median_price(env: &Env, prices: &Vec<PriceData>) -> i128 {
        let mut vals: Vec<i128> = vec![env];
        for p in prices.iter() {
            if p.price <= 0 {
                soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable);
            }
            vals.push_back(p.price);
        }
        let len = vals.len();
        let mut i = 1u32;
        while i < len {
            let key = vals.get(i).unwrap();
            let mut j = i;
            while j > 0 && vals.get(j - 1).unwrap() > key {
                let prev = vals.get(j - 1).unwrap();
                vals.set(j, prev);
                j -= 1;
            }
            vals.set(j, key);
            i += 1;
        }
        vals.get(len / 2).unwrap()
    }

    /// Convert a USD-base oracle `price` (scaled by the oracle's `decimals`) into local
    /// fiat for `usdc_amount` whole USDC: local = usdc * 10^decimals / price. Reads the
    /// oracle's decimals (so a feed-config change can't silently misscale) and uses
    /// checked math, so a buggy/hostile oracle yields FxUnavailable, never a VM trap.
    fn price_to_local(env: &Env, oracle: &Address, usdc_amount: i128, price: i128) -> i128 {
        let decimals: u32 = env.invoke_contract(oracle, &Symbol::new(env, "decimals"), vec![env]);
        let scale = match 10i128.checked_pow(decimals) {
            Some(s) => s,
            None => soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable),
        };
        // local = usdc * scale / price  (USD->local is the reciprocal of price/scale)
        match usdc_amount.checked_mul(scale) {
            Some(num) => num / price,
            None => soroban_sdk::panic_with_error!(env, PoolError::FxUnavailable),
        }
    }

    /// Trustless root advance (G6). Anyone may advance the tree, but only with a
    /// proof that inserting `new_leaf` at an empty slot of the **current** root
    /// yields exactly `new_root`. Requiring `old_root == current_root` makes the
    /// tree a single append-only **global accumulator**: every insert builds on
    /// the latest on-chain state. The ordered leaves are stored durably on-chain
    /// (read them back with `leaves()`), so any client can reconstruct the exact
    /// tree from contract STATE — no reliance on event retention.
    ///
    /// **Backing (critical).** The leaf must be a commitment the pool already
    /// recorded via a `deposit` (tokens moved in) or a `transfer`/`withdraw`
    /// change-note output (value conserved by its own proof), and it may be
    /// inserted at most once. Without these gates this entrypoint is permissionless
    /// and would accept ANY leaf — an attacker could insert a commitment they never
    /// deposited, then `withdraw` against it and drain the pool, because the
    /// merkleUpdate proof only attests the root math, not that the leaf is backed.
    pub fn register_root_verified(
        env: Env,
        proof: Groth16Proof,
        old_root: BytesN<32>,
        new_leaf: BytesN<32>,
        new_root: BytesN<32>,
    ) {
        // Canonical encodings only, so a leaf/root can't be re-encoded (x+r) to dodge a
        // storage-key check while still satisfying the mod-r-reduced proof input.
        Self::require_canonical(&env, &old_root);
        Self::require_canonical(&env, &new_leaf);
        Self::require_canonical(&env, &new_root);
        Self::bump_instance(&env);
        let cur: BytesN<32> = env.storage().instance().get(&DataKey::CurrentRoot).unwrap();
        if old_root != cur {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownRoot);
        }
        // The leaf must be a real, backed commitment (see the "Backing" note above).
        if !env.storage().persistent().has(&DataKey::Commitment(new_leaf.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownCommitment);
        }
        // Insert-once: a second insertion of the same commitment at a different
        // index would mint a second spendable leaf (a different nullifier) from one
        // deposit — also a drain. Mark it consumed for insertion.
        let ins_key = DataKey::Inserted(new_leaf.clone());
        if env.storage().persistent().has(&ins_key) {
            soroban_sdk::panic_with_error!(&env, PoolError::LeafAlreadyInserted);
        }
        env.storage().persistent().set(&ins_key, &());
        // The depth-10 tree holds at most 2^10 leaves; `n` is also the slot we store
        // the leaf at AND the index we pin the proof to (below).
        let n: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        if n >= 1u32 << 10 {
            soroban_sdk::panic_with_error!(&env, PoolError::TreeFull);
        }
        // Bind the proof's insertion index to OUR `LeafCount`. The merkleUpdate
        // circuit exposes `leafIndex` as a PUBLIC input; by feeding our own `n` here
        // we force the proof to attest insertion at exactly the slot we store the
        // leaf in. Without this, a prover could attest insertion at a different empty
        // index than `LeafCount`, desyncing the durable `leaves()` list from
        // `current_root` and permanently bricking the shared accumulator.
        let pi = vec![
            &env,
            Self::fr(&env, &old_root),
            Self::fr(&env, &new_leaf),
            Self::fr(&env, &new_root),
            Self::fr(&env, &Self::amount_bytes(&env, n as i128)),
        ];
        Self::verify(&env, DataKey::UpdateVerifier, &proof, &pi);
        Self::record_commitment(&env, &new_leaf);
        // Store the leaf at its tree index durably, so the ordered leaf list is
        // reconstructable from contract state (via `leaves()`) — reliably, with no
        // dependency on RPC event retention.
        env.storage().persistent().set(&DataKey::Leaf(n), &new_leaf);
        env.storage().instance().set(&DataKey::LeafCount, &(n + 1));
        env.storage().persistent().set(&DataKey::Root(new_root.clone()), &());
        env.storage().instance().set(&DataKey::CurrentRoot, &new_root);
        // Keep this leaf + root readable on a long-lived pool (TTL maintenance).
        env.storage().persistent().extend_ttl(&DataKey::Leaf(n), TTL_THRESHOLD, TTL_EXTEND);
        env.storage().persistent().extend_ttl(&ins_key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().persistent().extend_ttl(&DataKey::Root(new_root.clone()), TTL_THRESHOLD, TTL_EXTEND);
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
        // amount must be positive and fit the disclosure circuit's 64-bit range
        // (the amount-binding proof can't be generated otherwise).
        if amount <= 0 || amount >= (1i128 << 64) {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        // Canonical commitment only — a non-canonical re-encoding would key the backing
        // record under a different byte string than its reduced proof/tree value.
        Self::require_canonical(&env, &commitment);
        // Reject a duplicate commitment up front: a second deposit to the same
        // commitment would move tokens in but could never become a second spendable
        // leaf (insert-once), permanently locking those tokens. Fail before any
        // token moves. (`transfer`/`withdraw` legitimately re-record outputs and
        // rely on `record_commitment` idempotence, so this guard is deposit-only.)
        if env.storage().persistent().has(&DataKey::Commitment(commitment.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::DuplicateCommitment);
        }
        from.require_auth();
        Self::bump_instance(&env);

        // 1. Compliance: the AUTHENTICATED depositor `from` is an allow-listed
        // source, bound to this commitment. The contract derives the source key
        // itself as field(from) = keccak256(from XDR) mod r and sets it as the
        // compliance public input — so the proof shows *this* depositor is approved
        // (it can't be forged with someone else's public membership witness).
        // public inputs: [aspRoot, deny0..7, sourceKey=field(from), bindHash=commitment]
        let asp_root: BytesN<32> = env.storage().instance().get(&DataKey::AspRoot).unwrap();
        let deny: Vec<BytesN<32>> = env.storage().instance().get(&DataKey::DenyList).unwrap();
        let mut pi = vec![&env, Self::fr(&env, &asp_root)];
        for d in deny.iter() {
            pi.push_back(Self::fr(&env, &d));
        }
        pi.push_back(Self::addr_field(&env, &from));
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

    /// On-chain Poseidon (circomlib-compatible, t=3) computed with the BN254 host
    /// field ops — returns the SAME hash the circuits/frontend use, verifiable by
    /// calling this on testnet. NOTE: one hash costs ~13.6M CPU, so a full depth-10
    /// Merkle insert (10 hashes ≈ 135M) exceeds the ~100M per-tx budget — which is
    /// exactly why the tree is advanced with a cheap merkleUpdate SNARK
    /// (`register_root_verified`, one pairing) instead of hashing on-chain.
    pub fn poseidon_hash(env: Env, a: BytesN<32>, b: BytesN<32>) -> BytesN<32> {
        poseidon::hash2(&env, &a, &b)
    }

    /// field(addr) = keccak256(addr ScVal XDR) reduced mod r — the exact value the pool
    /// pins as the compliance `sourceKey` public input for a depositor. Exposed as a view
    /// so a client (or judge) can confirm the browser's field(addr) matches the contract's
    /// on-chain derivation, i.e. the allow-list membership really authenticates `from`.
    pub fn source_key_of(env: Env, addr: Address) -> BytesN<32> {
        Self::addr_field(&env, &addr).to_bytes()
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
        // A pure shielded transfer moves NO external value: it must conserve value
        // entirely inside the shielded set. The circuit only enforces
        // `sumIn + publicAmount == sumOut`, and zero-amount inputs skip the Merkle
        // membership check — so a positive `public_amount` with two zero-value dummy
        // inputs would MINT a fully-backed output commitment out of nothing (which
        // could then be registered into the tree and withdrawn for real tokens).
        // Bind `public_amount` to zero here; any external value MUST go through
        // `deposit` (tokens in, positive) or `withdraw` (tokens out, negative).
        if public_amount != Self::amount_bytes(&env, 0) {
            soroban_sdk::panic_with_error!(&env, PoolError::AmountNotBound);
        }
        Self::bump_instance(&env);
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
        nullifiers: Vec<BytesN<32>>,
        out_commitments: Vec<BytesN<32>>,
        recipient: Address,
        amount: i128,
        offramp_symbol: Option<Symbol>,
        min_local_out: Option<i128>,
    ) {
        if amount <= 0 {
            soroban_sdk::panic_with_error!(&env, PoolError::InvalidAmount);
        }
        // Bind the released amount to the verified public input. A withdraw has a
        // NEGATIVE publicAmount (value leaving the shielded set), so we bind to
        // the field-negative of `amount` — not the positive encoding.
        if public_amount != Self::neg_amount_bytes(&env, amount) {
            soroban_sdk::panic_with_error!(&env, PoolError::AmountNotBound);
        }
        Self::bump_instance(&env);
        Self::require_known_root(&env, &root);
        // Bind the RECIPIENT into the proof: the contract recomputes ext_data_hash
        // from (recipient, public_amount) instead of trusting a caller argument.
        // The withdraw proof was generated with exactly this hash, so an observer
        // cannot replay the same proof+nullifiers to a different recipient (the
        // recomputed hash would differ and the proof would fail to verify).
        let ext_data_hash = Self::ext_data_hash(&env, &recipient, &public_amount);
        let pi = Self::transfer_inputs(&env, &root, &public_amount, &ext_data_hash, &nullifiers, &out_commitments);
        Self::verify(&env, DataKey::TransferVerifier, &proof, &pi);
        // Optional min-receive settlement gate. When the caller asks for off-ramp
        // slippage protection, the pool reads Reflector ON-CHAIN for the live local
        // rate and refuses to release if it would deliver less than `min_local_out`.
        // This makes the oracle LOAD-BEARING for fund movement, not just display.
        // It runs after proof verification but BEFORE nullifiers are spent, so a
        // withdraw rejected for too much slippage burns no nullifier and can be
        // retried when the rate recovers. Fail-closed: a stale/absent feed traps the
        // read into FxUnavailable here, so funds never move at an unknown rate.
        if let (Some(sym), Some(min_out)) = (&offramp_symbol, min_local_out) {
            let usdc_whole = amount / USDC_STROOPS; // 7-dp SAC -> whole-USDC quote unit
            // Settlement gate prices at the MEDIAN of recent records, not spot, so a
            // transient oracle manipulation can't lower the floor and force a bad fill.
            let local = Self::quote_local_median(&env, sym.clone(), usdc_whole, FX_GATE_RECORDS);
            if local < min_out {
                soroban_sdk::panic_with_error!(&env, PoolError::SlippageExceeded);
            }
        }
        // Per-corridor cap gate (the enforced-pool addition). If a policy registry is set,
        // the withdraw MUST name its off-ramp corridor (PolicyRequired), so the gate cannot
        // be skipped by omitting the symbol; the corridor's cap_usdc is read from the live
        // registry cross-contract and the pool refuses to release more than the cap. Runs
        // AFTER proof verification and the slippage gate but BEFORE nullifiers are spent, so
        // an over-cap withdraw burns no nullifier and can be retried under the cap. A
        // corridor with no registry entry is uncapped (allow). The cap is in whole USDC and
        // the released amount is 7-dp stroops, so the CAP is scaled up to stroops (never the
        // amount floored down): cap + 0.0000001 USDC is still over the cap.
        if let Some(registry) = env.storage().instance().get::<_, Address>(&DataKey::PolicyRegistry) {
            let sym = match &offramp_symbol {
                Some(s) => s.clone(),
                None => soroban_sdk::panic_with_error!(&env, PoolError::PolicyRequired),
            };
            let entry: Option<PolicyEntry> = env.invoke_contract(
                &registry,
                &Symbol::new(&env, "policy"),
                vec![&env, sym.into_val(&env)],
            );
            if let Some(p) = entry {
                let cap_stroops = match p.cap_usdc.checked_mul(USDC_STROOPS) {
                    Some(c) => c,
                    None => soroban_sdk::panic_with_error!(&env, PoolError::PolicyExceeded),
                };
                if amount > cap_stroops {
                    soroban_sdk::panic_with_error!(&env, PoolError::PolicyExceeded);
                }
            }
        }
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
        Self::require_canonical(&env, &commitment);
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

    /// Verify a THRESHOLD (range) selective-disclosure proof for a regulator: prove the
    /// payment behind `commitment` is <= `threshold` WITHOUT revealing the exact amount.
    /// Like `disclose`, the commitment MUST be one the pool actually knows — so the
    /// attestation is bound to a real on-chain deposit, not a free-floating proof. The
    /// threshold circuit's public inputs are [commitment, threshold, auditContextHash].
    /// Requires the admin to have set the threshold verifier (set_threshold_verifier).
    pub fn disclose_threshold(
        env: Env,
        proof: Groth16Proof,
        commitment: BytesN<32>,
        threshold: BytesN<32>,
        audit_context: BytesN<32>,
    ) -> bool {
        Self::require_canonical(&env, &commitment);
        if !env.storage().persistent().has(&DataKey::Commitment(commitment.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownCommitment);
        }
        if !env.storage().instance().has(&DataKey::ThresholdVerifier) {
            soroban_sdk::panic_with_error!(&env, PoolError::ProofRejected);
        }
        let pi = vec![
            &env,
            Self::fr(&env, &commitment),
            Self::fr(&env, &threshold),
            Self::fr(&env, &audit_context),
        ];
        Self::verify(&env, DataKey::ThresholdVerifier, &proof, &pi);
        true
    }

    /// Verify a VARIABLE-COUNT AGGREGATE (portfolio) disclosure proof: prove the SUM of the
    /// ACTIVE payments (1..AGG_N of them) is <= `cap` WITHOUT revealing any amount. Each slot
    /// has a public `active` flag (0/1); only ACTIVE slots must be commitments the pool knows,
    /// so the report is bound to real on-chain deposits while the count varies. The circuit's
    /// public inputs are [commitments[0..N], active[0..N], cap, auditContextHash, ctxNonce], and
    /// the circuit enforces auditContextHash == Poseidon(ctxNonce, commitments, active). Completeness
    /// is enforced ON-CHAIN: the auditContextHash MUST be an audit request the auditor previously
    /// registered (register_audit_request) for the full set — else UnknownAuditRequest. So a holder
    /// can't mint their own hash for a cherry-picked subset. Requires the aggregate verifier set.
    pub fn disclose_aggregate(
        env: Env,
        proof: Groth16Proof,
        commitments: Vec<BytesN<32>>,
        active: Vec<u32>,
        cap: BytesN<32>,
        audit_context: BytesN<32>,
        ctx_nonce: BytesN<32>,
    ) -> bool {
        if commitments.len() != AGG_N || active.len() != AGG_N {
            soroban_sdk::panic_with_error!(&env, PoolError::BadIoCount);
        }
        if !env.storage().instance().has(&DataKey::AggregateVerifier) {
            soroban_sdk::panic_with_error!(&env, PoolError::ProofRejected);
        }
        // COMPLETENESS (on-chain): the auditContextHash MUST be an audit request the auditor
        // registered (for the full required set). A holder can't mint their own hash for a
        // cherry-picked subset — it isn't registered, so the report is rejected here.
        if !env.storage().persistent().has(&DataKey::AuditRequest(audit_context.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownAuditRequest);
        }
        // Public-input order = [commitments(N), active(N), cap, auditContextHash, ctxNonce]. All commitments are
        // canonicalised; only ACTIVE slots must be known deposits (inactive slots are padding
        // the circuit ignores). At least one slot must be active — a zero-payment report is
        // meaningless. (Duplicates among active slots only INFLATE the proven sum, the fail-safe
        // direction; deposit rejects duplicate commitments so the frontend passes distinct ones.)
        let mut pi = vec![&env];
        for c in commitments.iter() {
            Self::require_canonical(&env, &c);
            pi.push_back(Self::fr(&env, &c));
        }
        let mut any_active = false;
        for i in 0..AGG_N {
            let a = active.get(i).unwrap();
            if a != 0 && a != 1 {
                soroban_sdk::panic_with_error!(&env, PoolError::BadIoCount);
            }
            if a == 1 {
                any_active = true;
                let c = commitments.get(i).unwrap();
                if !env.storage().persistent().has(&DataKey::Commitment(c)) {
                    soroban_sdk::panic_with_error!(&env, PoolError::UnknownCommitment);
                }
            }
            pi.push_back(Self::fr(&env, &Self::amount_bytes(&env, a as i128)));
        }
        if !any_active {
            soroban_sdk::panic_with_error!(&env, PoolError::BadIoCount);
        }
        Self::require_canonical(&env, &cap);
        pi.push_back(Self::fr(&env, &cap));
        // pi order = [commitments(5), active(5), cap, auditContextHash, ctxNonce] — the circuit
        // enforces auditContextHash == Poseidon(ctxNonce, commitments, active) (completeness).
        pi.push_back(Self::fr(&env, &audit_context));
        pi.push_back(Self::fr(&env, &ctx_nonce));
        Self::verify(&env, DataKey::AggregateVerifier, &proof, &pi);
        true
    }

    /// Verify a two-sided RANGE (band) disclosure proof: prove the payment behind
    /// `commitment` satisfies lower <= amount <= upper WITHOUT revealing the amount. Like
    /// the other disclosures, the commitment must be a known on-chain deposit. The range
    /// circuit's public inputs are [commitment, lower, upper, auditContextHash]. Requires
    /// the admin to have set the range verifier (set_range_verifier).
    pub fn disclose_range(
        env: Env,
        proof: Groth16Proof,
        commitment: BytesN<32>,
        lower: BytesN<32>,
        upper: BytesN<32>,
        audit_context: BytesN<32>,
    ) -> bool {
        Self::require_canonical(&env, &commitment);
        if !env.storage().persistent().has(&DataKey::Commitment(commitment.clone())) {
            soroban_sdk::panic_with_error!(&env, PoolError::UnknownCommitment);
        }
        if !env.storage().instance().has(&DataKey::RangeVerifier) {
            soroban_sdk::panic_with_error!(&env, PoolError::ProofRejected);
        }
        let pi = vec![
            &env,
            Self::fr(&env, &commitment),
            Self::fr(&env, &lower),
            Self::fr(&env, &upper),
            Self::fr(&env, &audit_context),
        ];
        Self::verify(&env, DataKey::RangeVerifier, &proof, &pi);
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
    /// Number of leaves in the Merkle tree (i.e. registered deposits).
    pub fn leaf_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0)
    }
    /// The ordered Merkle-tree leaves (deposited commitments) from durable state.
    /// Lets any client reconstruct the exact tree without relying on event
    /// retention. Bounded by the tree capacity (2^depth).
    pub fn leaves(env: Env) -> Vec<BytesN<32>> {
        let n: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        Self::leaf_range(env, 0, n)
    }
    /// Paginated leaves [start, start+count) — lets clients reconstruct large trees
    /// in bounded chunks (a single full `leaves()` would exceed the read budget at
    /// scale; the tree caps at 2^depth leaves).
    pub fn leaf_range(env: Env, start: u32, count: u32) -> Vec<BytesN<32>> {
        let n: u32 = env.storage().instance().get(&DataKey::LeafCount).unwrap_or(0);
        let end = core::cmp::min(start.saturating_add(count), n);
        let mut out = vec![&env];
        let mut i = start;
        while i < end {
            let leaf: BytesN<32> = env.storage().persistent().get(&DataKey::Leaf(i)).unwrap();
            out.push_back(leaf);
            i += 1;
        }
        out
    }
    pub fn balance(env: Env) -> i128 {
        Self::token(&env).balance(&env.current_contract_address())
    }

    // ---- internals ----
    /// Keep the contract instance + code alive: extend to INSTANCE_TTL_EXTEND once under
    /// INSTANCE_TTL_THRESHOLD ledgers remain. Called by every state-changing entrypoint.
    fn bump_instance(env: &Env) {
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }
    fn token(env: &Env) -> TokenClient {
        let addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        TokenClient::new(env, &addr)
    }
    fn fr(env: &Env, b: &BytesN<32>) -> Bn254Fr {
        Bn254Fr::from_bytes(b.clone())
    }

    /// Reject a caller-supplied field element whose 32 bytes are NOT the canonical
    /// (reduced-mod-r) encoding. `Bn254Fr::from_bytes` silently reduces mod r, so
    /// `n`, `n+r`, `n+2r`, … all feed the SAME public input to the verifier and satisfy
    /// the SAME proof — but they are DISTINCT 32-byte storage keys. Without this guard a
    /// spent nullifier could be replayed as `n+r` (a different `DataKey::Nullifier` key
    /// that the double-spend check never finds) to drain the pool. Requiring the raw
    /// bytes to equal their own reduction makes every stored key canonical, so equivalent
    /// encodings can't diverge. `fr(b).to_bytes()` is the canonical form of `b`.
    fn require_canonical(env: &Env, b: &BytesN<32>) {
        if Self::fr(env, b).to_bytes() != *b {
            soroban_sdk::panic_with_error!(env, PoolError::NonCanonicalField);
        }
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

    /// 32-byte big-endian encoding of (r - amount) where r is the BN254 scalar
    /// field modulus — i.e. the field-negative of a positive i128. A withdraw
    /// moves value OUT of the shielded set, so in the JoinSplit value equation
    /// `sum(in) + publicAmount == sum(out)` its publicAmount is negative. We bind
    /// the released token `amount` to that negative public input, so the proof's
    /// semantics (value leaving) match what the contract actually does.
    fn neg_amount_bytes(env: &Env, amount: i128) -> BytesN<32> {
        // r = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
        const FIELD_R: [u8; 32] = [
            0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81,
            0x58, 0x5d, 0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93,
            0xf0, 0x00, 0x00, 0x01,
        ];
        let amt = Self::amount_bytes(env, amount).to_array(); // [u8; 32] BE
        let mut out = [0u8; 32];
        let mut borrow: i16 = 0;
        let mut i = 31i32;
        while i >= 0 {
            let k = i as usize;
            let diff = FIELD_R[k] as i16 - amt[k] as i16 - borrow;
            if diff < 0 {
                out[k] = (diff + 256) as u8;
                borrow = 1;
            } else {
                out[k] = diff as u8;
                borrow = 0;
            }
            i -= 1;
        }
        BytesN::from_array(env, &out)
    }

    /// keccak256(recipient XDR || public_amount) — the ext-data binding used by
    /// `withdraw`. The browser builds the withdraw proof with this exact value, so
    /// the proof commits to the recipient and can't be replayed to another one.
    fn ext_data_hash(env: &Env, recipient: &Address, public_amount: &BytesN<32>) -> BytesN<32> {
        use soroban_sdk::xdr::ToXdr;
        let mut data = recipient.clone().to_xdr(env);
        data.extend_from_array(&public_amount.to_array());
        env.crypto().keccak256(&data).to_bytes()
    }

    /// field(addr) = keccak256(addr ScVal XDR) reduced mod r — the allow-list key
    /// for an account. The browser derives it identically, so the compliance
    /// proof's public sourceKey is pinned to the authenticated depositor.
    fn addr_field(env: &Env, addr: &Address) -> Bn254Fr {
        use soroban_sdk::xdr::ToXdr;
        let h = env.crypto().keccak256(&addr.clone().to_xdr(env));
        Bn254Fr::from_bytes(h.to_bytes())
    }

    fn transfer_inputs(
        env: &Env,
        root: &BytesN<32>,
        public_amount: &BytesN<32>,
        ext_data_hash: &BytesN<32>,
        nullifiers: &Vec<BytesN<32>>,
        out_commitments: &Vec<BytesN<32>>,
    ) -> Vec<Bn254Fr> {
        // Pin the input/output counts: the verifier sees only the flat vector, so an
        // unpinned split (e.g. 1 nullifier + 3 commitments) would verify the same proof
        // while spending one fewer nullifier -> double-spend. Both callers route through
        // here, so one guard covers transfer AND withdraw.
        if nullifiers.len() != TRANSFER_NINS || out_commitments.len() != TRANSFER_NOUTS {
            soroban_sdk::panic_with_error!(env, PoolError::BadIoCount);
        }
        // Caller-supplied field elements MUST be canonical: nullifiers double as storage
        // keys, so a non-canonical re-encoding (n+r) would verify the same proof yet miss
        // the double-spend guard. root/out_commitments guarded too for consistency.
        // (public_amount is pool-set — 0 for transfer, on-chain neg for withdraw — and
        // ext_data_hash is recomputed on-chain, so neither is attacker-controlled.)
        Self::require_canonical(env, root);
        let mut pi = vec![
            env,
            Self::fr(env, root),
            Self::fr(env, public_amount),
            Self::fr(env, ext_data_hash),
        ];
        for n in nullifiers.iter() {
            Self::require_canonical(env, &n);
            pi.push_back(Self::fr(env, &n));
        }
        for c in out_commitments.iter() {
            Self::require_canonical(env, &c);
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
            // Keep the spent marker alive as long as the roots/leaves it guards. On a
            // long-lived accumulator the leaves and roots are continually TTL-extended,
            // so a note stays provable indefinitely; if its nullifier were allowed to
            // expire and be archived, `has(&key)` would read false and the same note
            // could be spent again. Extend to match the root/leaf TTL.
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        }
    }

    fn record_commitment(env: &Env, commitment: &BytesN<32>) -> u32 {
        let key = DataKey::Commitment(commitment.clone());
        let count: u32 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        if env.storage().persistent().has(&key) {
            return count; // already recorded — don't double-count
        }
        env.storage().persistent().set(&key, &());
        // Keep the commitment readable on a long-lived pool, so a deposit that hasn't
        // been registered into the tree yet can't have its backing record archived
        // out from under a later `register_root_verified`.
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        env.storage().instance().set(&DataKey::Count, &(count + 1));
        count
    }

    fn verify(env: &Env, which: DataKey, proof: &Groth16Proof, public_inputs: &Vec<Bn254Fr>) {
        let verifier: Address = env.storage().instance().get(&which).unwrap();
        // The Nethermind verifier TRAPS on an invalid proof, but we don't rely on
        // that: assert the returned bool too, so a verifier that returns `false`
        // (a common Groth16 convention) can never make a proof check a no-op.
        let ok: bool = env.invoke_contract(
            &verifier,
            &VERIFY,
            vec![env, proof.into_val(env), public_inputs.into_val(env)],
        );
        if !ok {
            soroban_sdk::panic_with_error!(env, PoolError::ProofRejected);
        }
    }

    // ---- timelock internals (shared by all gated setters) ----

    fn admin_addr(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// Store a pending change for `setter` with `eta = now + DELAY` (admin-gated). One slot per
    /// setter — a re-propose overwrites, but every proposal still waits the full delay from now.
    fn propose(env: &Env, setter: Setter, value: PendingValue, name: Symbol) {
        Self::admin_addr(env).require_auth();
        Self::bump_instance(env);
        let delay: u64 = env.storage().instance().get(&DataKey::TimelockDelay).unwrap();
        let eta = env.ledger().timestamp().saturating_add(delay);
        env.storage().instance().set(&DataKey::Pending(setter), &(value, eta));
        env.events().publish((symbol_short!("tl_prop"), name), eta);
    }

    /// Admin-gated: require a pending change exists for `setter` AND its eta has elapsed, then
    /// remove and return it. Too-early -> TimelockNotReady (#20); nothing pending -> TimelockEmpty (#21).
    fn take_ready(env: &Env, setter: Setter) -> PendingValue {
        Self::admin_addr(env).require_auth();
        Self::bump_instance(env);
        let key = DataKey::Pending(setter);
        let (value, eta): (PendingValue, u64) = match env.storage().instance().get(&key) {
            Some(p) => p,
            None => soroban_sdk::panic_with_error!(env, PoolError::TimelockEmpty),
        };
        if env.ledger().timestamp() < eta {
            soroban_sdk::panic_with_error!(env, PoolError::TimelockNotReady);
        }
        env.storage().instance().remove(&key);
        value
    }

    /// Admin-gated: clear a pending change (nothing pending -> TimelockEmpty #21).
    fn cancel(env: &Env, setter: Setter, name: Symbol) {
        Self::admin_addr(env).require_auth();
        Self::bump_instance(env);
        let key = DataKey::Pending(setter);
        if !env.storage().instance().has(&key) {
            soroban_sdk::panic_with_error!(env, PoolError::TimelockEmpty);
        }
        env.storage().instance().remove(&key);
        env.events().publish((symbol_short!("tl_cancel"), name), ());
    }

    /// Apply a matured pending value to the SAME storage the direct setter used.
    fn apply(env: &Env, value: PendingValue) {
        let s = env.storage().instance();
        match value {
            PendingValue::AspRoot(r) => s.set(&DataKey::AspRoot, &r),
            PendingValue::DenyList(d) => s.set(&DataKey::DenyList, &d),
            PendingValue::FxOracle(a) => s.set(&DataKey::FxOracle, &a),
            PendingValue::Auditor(a) => s.set(&DataKey::Auditor, &a),
            PendingValue::PolicyRegistry(a) => s.set(&DataKey::PolicyRegistry, &a),
            PendingValue::Admin(a) => s.set(&DataKey::Admin, &a),
            // The one non-storage apply: swap this contract's code (same address, same state).
            PendingValue::Upgrade(h) => env.deployer().update_current_contract_wasm(h),
        }
    }
}

#[cfg(test)]
mod test;

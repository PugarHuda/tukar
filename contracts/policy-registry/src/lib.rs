#![no_std]

//! Tukar policy-registry — per-corridor compliance policy as REAL on-chain records.
//!
//! Additive to the live corridor pool: the pool enforces the single global ASP
//! allow-root + deny-list; this contract stores the per-corridor amount cap and
//! required-disclosure mode a licensed anchor configures per jurisdiction. The
//! operator console reads these records live (instead of a hardcoded frontend map)
//! and the admin re-points them with a single admin-signed `set_policy` — no
//! redeploy, mirroring how the pool's `set_asp_root` / `set_deny_list` work.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec,
};

// Instance TTL bounds (every record lives in the instance): at ~5s per ledger, under ~7 days
// left (120_960) -> extend to ~30 days (518_400). Bumped on every set_policy.
const INSTANCE_TTL_THRESHOLD: u32 = 120_960;
const INSTANCE_TTL_EXTEND: u32 = 518_400;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PolicyError {
    InvalidCap = 1, // cap_usdc must be >= 0 (whole USDC); a negative cap is meaningless
}

/// A per-corridor policy record. `disclosure` mirrors the operator UI's enum:
/// 0 = exact, 1 = threshold, 2 = range, 3 = aggregate.
#[contracttype]
#[derive(Clone)]
pub struct PolicyEntry {
    pub cap_usdc: i128,
    pub disclosure: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Corridors,
    Policy(Symbol),
}

#[contract]
pub struct PolicyRegistry;

#[contractimpl]
impl PolicyRegistry {
    /// Seed the registry AT DEPLOY, without an admin signature: the deploy signer
    /// pays for the deploy while `admin` (a parameter) becomes the party that can
    /// later re-point policies. So we seed the initial corridors without holding
    /// the admin secret. `corridors[i]` maps to `entries[i]`.
    pub fn __constructor(env: Env, admin: Address, corridors: Vec<Symbol>, entries: Vec<PolicyEntry>) {
        if corridors.len() != entries.len() {
            panic!("corridors/entries length mismatch");
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Corridors, &corridors);
        for i in 0..corridors.len() {
            let c = corridors.get(i).unwrap();
            let e = entries.get(i).unwrap();
            if e.cap_usdc < 0 {
                soroban_sdk::panic_with_error!(&env, PolicyError::InvalidCap);
            }
            s.set(&DataKey::Policy(c), &e);
        }
    }

    /// Admin-only upsert of a corridor's policy. Maintains the corridor index so a
    /// brand-new corridor shows up in `corridors()`. Emits a `policy` event.
    pub fn set_policy(env: Env, corridor: Symbol, cap_usdc: i128, disclosure: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if cap_usdc < 0 {
            soroban_sdk::panic_with_error!(&env, PolicyError::InvalidCap);
        }
        env.storage().instance().extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        let s = env.storage().instance();
        let mut corridors: Vec<Symbol> = s.get(&DataKey::Corridors).unwrap_or(Vec::new(&env));
        // Add to the index only on first sight (upsert of an existing corridor keeps
        // the list unchanged).
        if !corridors.iter().any(|c| c == corridor) {
            corridors.push_back(corridor.clone());
            s.set(&DataKey::Corridors, &corridors);
        }
        let entry = PolicyEntry { cap_usdc, disclosure };
        s.set(&DataKey::Policy(corridor.clone()), &entry);
        env.events().publish((symbol_short!("policy"), corridor), (cap_usdc, disclosure));
    }

    /// The policy for a corridor, or None if unset.
    pub fn policy(env: Env, corridor: Symbol) -> Option<PolicyEntry> {
        env.storage().instance().get(&DataKey::Policy(corridor))
    }

    /// The corridor codes with a policy on record.
    pub fn corridors(env: Env) -> Vec<Symbol> {
        env.storage().instance().get(&DataKey::Corridors).unwrap_or(Vec::new(&env))
    }

    /// The admin allowed to `set_policy`.
    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

#[cfg(test)]
mod test;

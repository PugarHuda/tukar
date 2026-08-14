#![no_std]

//! Test-double corridor pool for the reserves end-to-end check.
//!
//! Exposes the same read-only `balance()` and `leaves()` the reserves contract calls, with
//! values set at deploy. Used ONLY to attest reserves on-chain against a leaf set whose note
//! openings we control (the live pool's notes are depositor-held, so a real proof can't be
//! built for them). Not a live contract; it custodies nothing and touches nothing live.

use soroban_sdk::{contract, contractimpl, symbol_short, BytesN, Env, Vec};

#[contract]
pub struct ReservesTestPool;

#[contractimpl]
impl ReservesTestPool {
    pub fn __constructor(env: Env, balance: i128, leaves: Vec<BytesN<32>>) {
        env.storage().instance().set(&symbol_short!("bal"), &balance);
        env.storage().instance().set(&symbol_short!("lv"), &leaves);
    }
    pub fn balance(env: Env) -> i128 {
        env.storage().instance().get(&symbol_short!("bal")).unwrap()
    }
    pub fn leaves(env: Env) -> Vec<BytesN<32>> {
        env.storage().instance().get(&symbol_short!("lv")).unwrap()
    }
}

// Pool contract PoolError codes (contracts/pool lib.rs) -> human messages, plus the two
// extractors that turn a thrown Error(Contract,#N) into a friendly string / numeric code.
// Server-safe and dependency-free. lib/relayer.ts imports POOL_ERRORS from here so the client
// and server maps cannot drift.
export const POOL_ERRORS: Record<number, string> = {
  1: "this root isn't recognized on-chain (the tree moved on — re-sync and retry)",
  2: "this note was already spent — its nullifier is used (double-spend rejected on-chain)",
  3: "unknown commitment — this note isn't in the pool",
  4: "the deny-list check failed on-chain",
  5: "invalid amount",
  6: "the amount isn't bound to the commitment (binding proof missing)",
  7: "the zero-knowledge proof was rejected by the on-chain verifier",
  8: "the corridor tree is full",
  9: "this leaf isn't a backed deposit, or was already inserted (unbacked-leaf insert rejected)",
  10: "this commitment was already deposited (duplicate deposit rejected — it would lock funds)",
  11: "the FX oracle has no live price for this currency (off-ramp quote unavailable)",
  12: "the live FX rate would deliver less than your minimum (slippage too high — release blocked, note unspent)",
  // preview-track pools (pool-enforced / pool-accumulator / pool-timelock)
  16: "this withdrawal is over the corridor's on-chain cap (release blocked, note unspent)",
  22: "this pool enforces corridor caps: the withdrawal must name its off-ramp corridor (release blocked, note unspent)",
};

export function friendlyPoolError(e: any): string {
  const msg = (e && e.message) || String(e);
  const m = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m && POOL_ERRORS[Number(m[1])]) return POOL_ERRORS[Number(m[1])];
  return msg;
}

export function poolErrorCode(e: any): number | null {
  const m = ((e && e.message) || String(e)).match(/Error\(Contract,\s*#(\d+)\)/);
  return m ? Number(m[1]) : null;
}

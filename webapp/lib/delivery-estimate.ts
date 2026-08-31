// Measured on-chain delivery time for the sender's cost card, from the pool's own events (the
// same RPC event reader the regulator export uses; no second RPC client). What the chain lets us
// pair exactly: a `deposit` event carries the commitment, and the `root` event that registers it
// into the shielded tree carries the same commitment as `new_leaf`. Their ledger close times give
// the deposit -> spendable leg per note. The withdraw CANNOT be paired to a deposit: that link is
// what the shielded pool hides (the nullifier is unlinkable), so no per-transfer deposit -> withdraw
// time exists on-chain, and none is claimed here. The fiat leg is the anchor's, not measured.
import { readPoolEvents, type PoolEvent } from "./compliance-export";

export type LegEstimate = { medianSec: number; samples: number };

/** Seconds from each deposit to the root event that registered its commitment, oldest first. */
export function onChainLegSamples(events: PoolEvent[]): number[] {
  const deposited = new Map<string, number>(); // commitment -> deposit close time (ms)
  const out: number[] = [];
  for (const e of events) {
    if (e.kind === "deposit" && e.commitment) {
      if (!deposited.has(e.commitment)) deposited.set(e.commitment, Date.parse(e.closedAt));
    } else if (e.kind === "root" && e.newLeaf && deposited.has(e.newLeaf)) {
      const dt = (Date.parse(e.closedAt) - deposited.get(e.newLeaf)!) / 1000;
      if (Number.isFinite(dt) && dt >= 0) out.push(dt);
      deposited.delete(e.newLeaf); // one registration per commitment
    }
  }
  return out;
}

/** Median of the paired samples, or null below `minSamples` (too few to call it an estimate). */
export function estimateOnChainLeg(events: PoolEvent[], minSamples = 3): LegEstimate | null {
  const s = onChainLegSamples(events).sort((a, b) => a - b);
  if (s.length < minSamples) return null;
  const mid = s.length >> 1;
  const medianSec = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { medianSec: Math.round(medianSec), samples: s.length };
}

// Live read, memoised per page load: the retained event window is the same for every corridor and
// amount, and a failed read is retried on the next call rather than pinned.
let _live: Promise<{ estimate: LegEstimate | null; samples: number; oldestLedger: number; latestLedger: number }> | null = null;
export function readOnChainLeg() {
  if (!_live) {
    _live = readPoolEvents()
      .then((w) => ({ estimate: estimateOnChainLeg(w.events), samples: onChainLegSamples(w.events).length, oldestLedger: w.oldestLedger, latestLedger: w.latestLedger }))
      .catch((e) => {
        _live = null;
        throw e;
      });
  }
  return _live;
}

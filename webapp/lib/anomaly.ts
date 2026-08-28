// Operator monitoring: the pool-side events inside the RPC retention window, plus the pure
// velocity / structuring / repeated-actor heuristics over them. The heuristics take plain
// event arrays so they are unit-testable without RPC; only readMonitoringWindow touches chain,
// through the shared rpc.Server in ./soroban/rpc.
//
// What the live pool (contracts/pool/src/lib.rs) emits, and so what is observable here:
//   (deposit, index)      -> (commitment, amount)   no depositor address in the event
//   (withdraw, recipient) -> amount
//   (transfer,)           -> root
//   (root, new_leaf)      -> new_root
// set_asp_root / set_deny_list / set_auditor / set_fx_oracle on the live pool emit nothing.
// The policy registry emits (policy, corridor) -> (cap_usdc, disclosure) and the preview
// timelock pool emits (tl_prop|tl_exec|tl_cancel, setter). The depositor is recovered by
// joining the USDC SAC `transfer` event into the pool on the same txHash.
import * as Sdk from "@stellar/stellar-sdk";
import { server } from "./soroban/rpc";
import { POOL, POLICY_REGISTRY } from "./constants";

// From deployments/testnet.json: the USDC SAC the live pool custodies, and the preview
// timelock pool whose propose/execute/cancel events are the only timelock signal on chain.
export const POOL_TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";
export const POOL_TIMELOCK = "CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2";

export const ADMIN_KINDS = ["policy", "tl_prop", "tl_exec", "tl_cancel"] as const;

export type MonEvent = {
  kind: string; // deposit | withdraw | transfer | root | token_in | policy | tl_prop | tl_exec | tl_cancel
  contract: string;
  ledger: number;
  closedAt: number; // unix seconds (ledger close time)
  txHash: string;
  amount?: bigint; // stroops: deposit / withdraw / token_in
  actor?: string; // token_in sender, withdraw recipient
  detail?: string; // policy corridor, timelock setter name
  data?: string; // short human summary of the payload
};

export type MonWindow = {
  fromLedger: number;
  toLedger: number;
  fromSec: number;
  toSec: number;
  retentionLedgers: number;
  truncated: boolean; // hit the page cap before the window ended
  events: MonEvent[];
};

export type Deposit = { ledger: number; closedAt: number; txHash: string; amount: bigint; actor?: string };
export type Bucket = { startSec: number; count: number; usdc: number };

const STROOPS = 1e7;
export const stroopsToUsdc = (a: bigint): number => Number(a) / STROOPS;

const native = (v: Sdk.xdr.ScVal | undefined): any => {
  if (!v) return undefined;
  try {
    return Sdk.scValToNative(v);
  } catch {
    return undefined;
  }
};
const asBig = (v: any): bigint | undefined => {
  if (typeof v === "bigint") return v;
  if (v && typeof v === "object" && typeof v.amount === "bigint") return v.amount; // P23 muxed transfer payload
  return undefined;
};

/** Normalize one raw RPC event into a MonEvent (null when it is not one we track). */
export function decodeEvent(ev: Sdk.rpc.Api.EventResponse): MonEvent | null {
  if (ev.inSuccessfulContractCall === false) return null;
  const contract = ev.contractId ? ev.contractId.contractId() : "";
  const t0 = native(ev.topic[0]);
  if (typeof t0 !== "string") return null;
  const base = { contract, ledger: ev.ledger, closedAt: Math.floor(Date.parse(ev.ledgerClosedAt) / 1000), txHash: ev.txHash };
  const value = native(ev.value);
  if (contract === POOL_TOKEN) {
    if (t0 !== "transfer") return null;
    const from = native(ev.topic[1]);
    return { ...base, kind: "token_in", amount: asBig(value), actor: typeof from === "string" ? from : undefined };
  }
  if (contract === POLICY_REGISTRY) {
    const corridor = native(ev.topic[1]);
    const cap = Array.isArray(value) ? asBig(value[0]) : undefined;
    const disc = Array.isArray(value) ? value[1] : undefined;
    return { ...base, kind: t0, detail: typeof corridor === "string" ? corridor : undefined, data: cap != null ? `cap ${cap.toString()} USDC, disclosure ${String(disc)}` : undefined };
  }
  if (contract === POOL_TIMELOCK && t0.startsWith("tl_")) {
    const name = native(ev.topic[1]);
    const eta = asBig(value);
    return { ...base, kind: t0, detail: typeof name === "string" ? name : undefined, data: eta != null ? `eta ${new Date(Number(eta) * 1000).toISOString()}` : undefined };
  }
  if (t0 === "deposit") {
    const amount = Array.isArray(value) ? asBig(value[1]) : undefined;
    const index = native(ev.topic[1]);
    return { ...base, kind: t0, amount, data: typeof index === "number" ? `leaf ${index}` : undefined };
  }
  if (t0 === "withdraw") {
    const to = native(ev.topic[1]);
    return { ...base, kind: t0, amount: asBig(value), actor: typeof to === "string" ? to : undefined };
  }
  return { ...base, kind: t0 };
}

/**
 * Every tracked event in the RPC retention window (about 7 days on public testnet), oldest
 * first: pool events, USDC transfers into the pool, policy-registry writes, timelock events.
 * One paginated getEvents call with four filters; pages are capped so a busy pool cannot
 * hang the console (truncated=true says the tail was cut).
 */
export async function readMonitoringWindow(pageLimit = 1000, maxPages = 10): Promise<MonWindow> {
  const health = await server.getHealth();
  const sym = (s: string) => Sdk.xdr.ScVal.scvSymbol(s).toXDR("base64");
  const pool = Sdk.nativeToScVal(POOL, { type: "address" }).toXDR("base64");
  const filters: Sdk.rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [POOL] },
    // SAC transfer topics are (transfer, from, to) since protocol 23, (transfer, from, to, asset) before.
    { type: "contract", contractIds: [POOL_TOKEN], topics: [[sym("transfer"), "*", pool], [sym("transfer"), "*", pool, "*"]] },
    { type: "contract", contractIds: [POLICY_REGISTRY] },
    { type: "contract", contractIds: [POOL_TIMELOCK] },
  ];
  // A few ledgers of slack: the retention window slides between getHealth and getEvents.
  let res = await server.getEvents({ startLedger: health.oldestLedger + 10, filters, limit: pageLimit });
  const fromLedger = res.oldestLedger;
  const fromSec = Number(res.oldestLedgerCloseTime);
  const events: MonEvent[] = [];
  let pages = 1;
  for (;;) {
    for (const ev of res.events) {
      const m = decodeEvent(ev);
      if (m) events.push(m);
    }
    if (res.events.length < pageLimit || pages >= maxPages) break;
    res = await server.getEvents({ cursor: res.cursor, filters, limit: pageLimit });
    pages++;
  }
  return {
    fromLedger,
    toLedger: res.latestLedger,
    fromSec,
    toSec: Number(res.latestLedgerCloseTime),
    retentionLedgers: health.ledgerRetentionWindow,
    truncated: res.events.length >= pageLimit && pages >= maxPages,
    events,
  };
}

/** Pool deposits with the depositor recovered from the token transfer in the same tx. */
export function deposits(events: MonEvent[]): Deposit[] {
  const byTx = new Map<string, string>();
  for (const e of events) if (e.kind === "token_in" && e.actor && !byTx.has(e.txHash)) byTx.set(e.txHash, e.actor);
  return events
    .filter((e) => e.kind === "deposit" && e.amount != null)
    .map((e) => ({ ledger: e.ledger, closedAt: e.closedAt, txHash: e.txHash, amount: e.amount!, actor: byTx.get(e.txHash) }));
}

function bucketize(deps: Deposit[], startSec: number, endSec: number, stepSec: number): Bucket[] {
  const out: Bucket[] = [];
  for (let s = startSec; s < endSec; s += stepSec) out.push({ startSec: s, count: 0, usdc: 0 });
  for (const d of deps) {
    const i = Math.floor((d.closedAt - startSec) / stepSec);
    if (i >= 0 && i < out.length) {
      out[i].count++;
      out[i].usdc += stroopsToUsdc(d.amount);
    }
  }
  return out;
}

/** Deposit velocity: the last 24 hours by hour (ending at toSec) and the whole window by UTC day. */
export function velocity(deps: Deposit[], fromSec: number, toSec: number): { hourly: Bucket[]; daily: Bucket[] } {
  const hourEnd = Math.floor(toSec / 3600) * 3600 + 3600;
  const dayStart = Math.floor(fromSec / 86400) * 86400;
  const dayEnd = Math.floor(toSec / 86400) * 86400 + 86400;
  return { hourly: bucketize(deps, hourEnd - 24 * 3600, hourEnd, 3600), daily: bucketize(deps, dayStart, dayEnd, 86400) };
}

/**
 * Structuring heuristic: deposits sitting just under a corridor cap (within `fraction` below
 * it, cap excluded). The deposit event carries no corridor, so a deposit is tested against every
 * distinct cap; a deposit counts once in `total` even if it sits under several caps.
 */
export function nearCap(deps: Deposit[], capsUsdc: number[], fraction = 0.1): { total: number; byCap: { cap: number; hits: Deposit[] }[] } {
  const caps = [...new Set(capsUsdc.filter((c) => c > 0))].sort((a, b) => a - b);
  const seen = new Set<string>();
  const byCap = caps.map((cap) => {
    const hits = deps.filter((d) => {
      const u = stroopsToUsdc(d.amount);
      return u >= cap * (1 - fraction) && u < cap;
    });
    for (const h of hits) seen.add(h.txHash);
    return { cap, hits };
  });
  return { total: seen.size, byCap: byCap.filter((b) => b.hits.length) };
}

/**
 * Repeated-actor heuristic: depositors with at least `minCount` deposits inside any rolling
 * `windowSec` span. Deposits whose actor could not be recovered are reported under `unattributed`.
 */
export function repeatedActors(
  deps: Deposit[],
  minCount: number,
  windowSec = 86400,
): { actors: { actor: string; total: number; maxInWindow: number }[]; unattributed: number } {
  const byActor = new Map<string, number[]>();
  let unattributed = 0;
  for (const d of deps) {
    if (!d.actor) {
      unattributed++;
      continue;
    }
    byActor.set(d.actor, [...(byActor.get(d.actor) ?? []), d.closedAt]);
  }
  const actors: { actor: string; total: number; maxInWindow: number }[] = [];
  for (const [actor, times] of byActor) {
    times.sort((a, b) => a - b);
    let best = 0;
    for (let i = 0, j = 0; j < times.length; j++) {
      while (times[j] - times[i] >= windowSec) i++;
      best = Math.max(best, j - i + 1);
    }
    if (best >= minCount) actors.push({ actor, total: times.length, maxInWindow: best });
  }
  actors.sort((a, b) => b.maxInWindow - a.maxInWindow || b.total - a.total);
  return { actors, unattributed };
}

/** Admin writes that emit events (policy registry set_policy, timelock propose/execute/cancel), newest first. */
export function adminEvents(events: MonEvent[]): MonEvent[] {
  return events.filter((e) => (ADMIN_KINDS as readonly string[]).includes(e.kind)).sort((a, b) => b.closedAt - a.closedAt || b.ledger - a.ledger);
}

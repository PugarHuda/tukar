import { describe, it, expect } from "vitest";
import { deposits, velocity, nearCap, repeatedActors, adminEvents, type MonEvent } from "./anomaly";

// Synthetic events only: the RPC reader is out of scope here. T0 is an arbitrary UTC midnight.
const T0 = 1_787_000_000 - (1_787_000_000 % 86400);
const U = 10_000_000n; // one USDC in stroops
const dep = (closedAt: number, usdc: number, tx: string): MonEvent => ({ kind: "deposit", contract: "pool", ledger: 1, closedAt, txHash: tx, amount: BigInt(usdc) * U });
const tok = (closedAt: number, usdc: number, tx: string, from: string): MonEvent => ({ kind: "token_in", contract: "tok", ledger: 1, closedAt, txHash: tx, amount: BigInt(usdc) * U, actor: from });

describe("deposits", () => {
  it("joins the depositor from the token transfer on the same tx and skips other kinds", () => {
    const d = deposits([dep(T0, 5, "a"), tok(T0, 5, "a", "GA"), dep(T0, 7, "b"), { kind: "withdraw", contract: "pool", ledger: 1, closedAt: T0, txHash: "c", amount: 1n }]);
    expect(d).toHaveLength(2);
    expect(d[0].actor).toBe("GA");
    expect(d[1].actor).toBeUndefined();
  });
});

describe("velocity", () => {
  it("buckets by hour for the last 24h and by UTC day over the window", () => {
    const to = T0 + 86400 + 3600 * 5 + 100; // day 1, 05:01:40
    const deps = deposits([dep(T0 + 10, 100, "a"), dep(T0 + 86400 + 3600 * 4 + 5, 50, "b"), dep(T0 + 86400 + 3600 * 5, 25, "c")]);
    const v = velocity(deps, T0 + 1, to);
    expect(v.daily).toHaveLength(2);
    expect(v.daily[0]).toEqual({ startSec: T0, count: 1, usdc: 100 });
    expect(v.daily[1]).toEqual({ startSec: T0 + 86400, count: 2, usdc: 75 });
    expect(v.hourly).toHaveLength(24);
    expect(v.hourly[23]).toEqual({ startSec: T0 + 86400 + 3600 * 5, count: 1, usdc: 25 });
    expect(v.hourly[22].count).toBe(1);
    expect(v.hourly.reduce((n, b) => n + b.count, 0)).toBe(2); // day-0 deposit is outside the 24h band
  });
});

describe("nearCap", () => {
  it("counts deposits within 10% under a cap, cap excluded, once per deposit", () => {
    const deps = deposits([dep(T0, 4500, "a"), dep(T0, 5000, "b"), dep(T0, 4499, "c"), dep(T0, 950, "d"), dep(T0, 2999, "e")]);
    const r = nearCap(deps, [5000, 3000, 1000, 5000, 0]);
    expect(r.byCap.map((b) => [b.cap, b.hits.map((h) => h.txHash)])).toEqual([
      [1000, ["d"]],
      [3000, ["e"]],
      [5000, ["a"]],
    ]);
    expect(r.total).toBe(3);
  });
  it("is empty without caps or hits", () => {
    expect(nearCap(deposits([dep(T0, 10, "a")]), [])).toEqual({ total: 0, byCap: [] });
    expect(nearCap(deposits([dep(T0, 10, "a")]), [1000]).byCap).toEqual([]);
  });
});

describe("repeatedActors", () => {
  it("flags an actor with >= N deposits inside a rolling 24h span", () => {
    const evs: MonEvent[] = [];
    for (let i = 0; i < 5; i++) evs.push(dep(T0 + i * 3600, 1, "a" + i), tok(T0 + i * 3600, 1, "a" + i, "GA"));
    for (let i = 0; i < 5; i++) evs.push(dep(T0 + i * 86400, 1, "b" + i), tok(T0 + i * 86400, 1, "b" + i, "GB")); // one per day: never 5 in 24h
    evs.push(dep(T0, 1, "z")); // no token join
    const r = repeatedActors(deposits(evs), 5);
    expect(r.actors).toEqual([{ actor: "GA", total: 5, maxInWindow: 5 }]);
    expect(r.unattributed).toBe(1);
    expect(repeatedActors(deposits(evs), 2).actors.map((a) => a.actor)).toEqual(["GA"]); // GB: exactly 24h apart never shares a window
    expect(repeatedActors(deposits(evs), 1).actors).toEqual([
      { actor: "GA", total: 5, maxInWindow: 5 },
      { actor: "GB", total: 5, maxInWindow: 1 },
    ]);
  });
});

describe("adminEvents", () => {
  it("keeps policy + timelock kinds, newest first", () => {
    const mk = (kind: string, closedAt: number): MonEvent => ({ kind, contract: "x", ledger: closedAt, closedAt, txHash: kind + closedAt });
    const r = adminEvents([mk("deposit", 3), mk("policy", 1), mk("tl_exec", 5), mk("tl_prop", 2), mk("root", 9), mk("tl_cancel", 4)]);
    expect(r.map((e) => e.kind)).toEqual(["tl_exec", "tl_cancel", "tl_prop", "policy"]);
  });
});

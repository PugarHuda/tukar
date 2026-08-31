import { describe, it, expect } from "vitest";
import { onChainLegSamples, estimateOnChainLeg } from "./delivery-estimate";
import { decodePoolEvent } from "./compliance-export";
import * as Sdk from "@stellar/stellar-sdk";

const t = (sec: number) => new Date(1_700_000_000_000 + sec * 1000).toISOString();
const dep = (c: string, sec: number, ledger = sec) => ({ kind: "deposit", commitment: c, ledger, closedAt: t(sec), txHash: "a" });
const root = (c: string, sec: number, ledger = sec) => ({ kind: "root", newLeaf: c, ledger, closedAt: t(sec), txHash: "b" });

describe("onChainLegSamples", () => {
  it("pairs each deposit with the root event carrying its commitment, once", () => {
    const events = [dep("1", 0), root("1", 12), dep("2", 20), root("9", 25), root("2", 41), root("2", 60), { kind: "withdraw", ledger: 70, closedAt: t(70), txHash: "c" }];
    expect(onChainLegSamples(events)).toEqual([12, 21]);
  });
  it("drops a root that predates its deposit and unregistered deposits", () => {
    expect(onChainLegSamples([root("1", 5), dep("1", 10), dep("2", 11)])).toEqual([]);
  });
});

describe("estimateOnChainLeg", () => {
  it("needs at least minSamples pairs", () => {
    expect(estimateOnChainLeg([dep("1", 0), root("1", 10), dep("2", 0), root("2", 10)])).toBeNull();
  });
  it("returns the median (odd and even counts) with the sample count", () => {
    const odd = [dep("1", 0), root("1", 30), dep("2", 0), root("2", 10), dep("3", 0), root("3", 20)];
    expect(estimateOnChainLeg(odd)).toEqual({ medianSec: 20, samples: 3 });
    const even = [...odd, dep("4", 0), root("4", 100)];
    expect(estimateOnChainLeg(even)).toEqual({ medianSec: 25, samples: 4 });
  });
});

describe("cursorLedger", () => {
  it("decodes the ledger from a getEvents cursor (TOID >> 32)", async () => {
    const { cursorLedger } = await import("./compliance-export");
    expect(cursorLedger("0018372375443668991-4294967295")).toBe(4277651); // a real testnet cursor: the scan stopped ~10k ledgers past the 4267652 start
    expect(cursorLedger(((4388611n << 32n) | 5n).toString() + "-0")).toBe(4388611);
  });
});

describe("decodePoolEvent root", () => {
  it("exposes new_leaf as a decimal commitment", () => {
    const leaf = new Uint8Array(32);
    leaf[31] = 7;
    const ev = { topic: [Sdk.xdr.ScVal.scvSymbol("root"), Sdk.xdr.ScVal.scvBytes(Buffer.from(leaf))], value: Sdk.xdr.ScVal.scvBytes(Buffer.alloc(32)), ledger: 1, ledgerClosedAt: t(0), txHash: "x" };
    expect(decodePoolEvent(ev)).toMatchObject({ kind: "root", newLeaf: "7" });
  });
});

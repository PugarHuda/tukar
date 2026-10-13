import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Sdk from "@stellar/stellar-sdk";
import { LIVE_CONTRACTS } from "./live-contracts";
import { checkContracts } from "./contract-status";

const dep = JSON.parse(readFileSync(resolve(__dirname, "../../deployments/testnet.json"), "utf8"));
const v = dep.verifiers;

describe("LIVE_CONTRACTS", () => {
  it("matches deployments/testnet.json", () => {
    expect(LIVE_CONTRACTS).toEqual({
      pool: dep.pool.contractId,
      transfer: v.transfer.contractId,
      compliance: v.compliance.contractId,
      disclosure: v.disclosure.contractId,
      merkleUpdate: v.merkleUpdate.contractId,
      threshold: v.thresholdDisclosure.id,
      aggregate: v.aggregateDisclosure.contractId,
      range: v.rangeDisclosure.contractId,
    });
  });
});

describe("checkContracts", () => {
  const ids = [LIVE_CONTRACTS.pool, LIVE_CONTRACTS.transfer];
  it("live when the instance entry comes back, missing when not, with the ledger", async () => {
    const r = await checkContracts(ids, async () => ({
      entries: [{ key: new Sdk.Contract(LIVE_CONTRACTS.pool).getFootprint() }],
      latestLedger: 123,
    }));
    expect(r.ledger).toBe(123);
    expect(r.contracts).toEqual({ [ids[0]]: "live", [ids[1]]: "missing" });
  });
  it("unreachable with no ledger when the RPC throws", async () => {
    const r = await checkContracts(ids, async () => { throw new Error("down"); });
    expect(r.ledger).toBeNull();
    expect(Object.values(r.contracts)).toEqual(["unreachable", "unreachable"]);
  });
});

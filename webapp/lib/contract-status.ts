// Server-side liveness check for the live contract set: one getLedgerEntries call for every
// contract's instance entry, stamped with the ledger the RPC answered at.
import * as Sdk from "@stellar/stellar-sdk";
import { makeServer } from "./soroban/rpc";
import type { ContractState, ContractStatus } from "./live-contracts";

type GetEntries = (...keys: Sdk.xdr.LedgerKey[]) => Promise<{ entries: { key: Sdk.xdr.LedgerKey }[]; latestLedger: number }>;

export async function checkContracts(ids: string[], getEntries?: GetEntries): Promise<ContractStatus> {
  const checkedAt = new Date().toISOString();
  const keyOf = (id: string) => new Sdk.Contract(id).getFootprint().toXDR("base64");
  try {
    const get = getEntries ?? ((...k) => { const s = makeServer(); return s.getLedgerEntries(...k); });
    const res = await get(...ids.map((id) => new Sdk.Contract(id).getFootprint()));
    const found = new Set(res.entries.map((e) => e.key.toXDR("base64")));
    const contracts: Record<string, ContractState> = {};
    for (const id of ids) contracts[id] = found.has(keyOf(id)) ? "live" : "missing";
    return { ledger: res.latestLedger, checkedAt, contracts };
  } catch {
    return { ledger: null, checkedAt, contracts: Object.fromEntries(ids.map((id) => [id, "unreachable" as const])) };
  }
}

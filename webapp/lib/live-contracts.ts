// The live corridor contracts on testnet: the pool plus its seven Groth16 verifiers (the set
// public/.well-known/stellar.toml publishes). One list for the landing page totals, the
// Contracts tab, and /api/contracts/status; live-contracts.test.ts pins every id to
// deployments/testnet.json. The additive contracts (policy registry, reserves, enforced pool)
// are not in this set.
import { POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER, AGGREGATE_VERIFIER, RANGE_VERIFIER } from "./constants";

export const LIVE_CONTRACTS = {
  pool: POOL,
  transfer: "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE",
  compliance: "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2",
  disclosure: DISCLOSURE_VERIFIER,
  merkleUpdate: "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H",
  threshold: THRESHOLD_VERIFIER,
  aggregate: AGGREGATE_VERIFIER,
  range: RANGE_VERIFIER,
} as const;

export const contractExplorer = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`;

/** live = instance entry found on-ledger; missing = RPC answered without it; unreachable = RPC failed. */
export type ContractState = "live" | "missing" | "unreachable";
export type ContractStatus = { ledger: number | null; checkedAt: string; contracts: Record<string, ContractState> };

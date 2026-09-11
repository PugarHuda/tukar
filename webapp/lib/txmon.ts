// Transaction-level monitoring: the half of the picture `getEvents` cannot see.
//
// A reverted Soroban transaction publishes NO contract events, so every error-rate signal in
// docs/THREAT_MODEL.md 5.3 (ProofRejected, NullifierUsed, NonCanonicalField, FxUnavailable,
// SlippageExceeded) is invisible to lib/anomaly.ts. This module reads the same corridor from
// transaction results instead. What the two public APIs actually give, measured on testnet:
//
//   Soroban RPC getTransactions  gives every transaction in a ledger range, no contract or account
//     filter. A page of 200 covers ~16 ledgers and takes ~2 s, so the ~7-day retention window is
//     ~7,500 pages. Unusable as a scan; that is the indexer the plan funds.
//   Soroban RPC getTransaction(hash) returns `diagnosticEventsXdr`, which carries the EXACT
//     contract error code (topics [symbol "error", error {contract: N}]) and the contract that
//     raised it, including a sub-invoked verifier. getTransactions does NOT return it. Only
//     inside the RPC retention window (~7 days); older hashes answer NOT_FOUND.
//   Horizon /accounts/{id}/transactions?include_failed=true gives full history by ACCOUNT, with the
//     envelope and the transaction result. No contract index, and no meta, so the coarse failure
//     kind (trapped / resource_limit_exceeded) survives forever but the error code does not.
//
// So the honest shape is: discover by account on Horizon, then ask the RPC for the code while the
// transaction is still in retention. That covers every account this corridor transacts with (the
// operator key, the relayer/demo key, the pool's auditor) completely and for all time at the
// coarse level. It does NOT cover a failed invocation submitted by an arbitrary third party: no
// public API indexes transactions by contract. That gap is stated in the console, not papered over.
//
// Everything below the reader is pure and unit-tested in txmon.test.ts.
import * as Sdk from "@stellar/stellar-sdk";
import { server, simulate } from "./soroban/rpc";
import { NETWORK, POOL, POOL_ENFORCED, POLICY_REGISTRY, RESERVES, RESERVES_AGGREGATE, SOURCE, DEMO_SECRET } from "./constants";
import { POOL_TOKEN, POOL_TIMELOCK, type MonEvent } from "./anomaly";

// SDF's public Horizon. Not a claim about a Tukar deployment (unlike a contract id), so both
// networks can be named here; NEXT_PUBLIC_HORIZON_URL overrides for a private instance.
export const HORIZON =
  process.env.NEXT_PUBLIC_HORIZON_URL || (NETWORK === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org");

/** Contracts whose top-level invocations this monitor reports on, with the label the console shows. */
export const WATCHED: Record<string, string> = {
  [POOL]: "pool",
  [POOL_ENFORCED]: "pool (preview · enforced caps)",
  [POOL_TIMELOCK]: "pool (preview · admin timelock)",
  [POOL_TOKEN]: "USDC SAC",
  [POLICY_REGISTRY]: "policy registry",
  [RESERVES]: "proof-of-reserves",
  [RESERVES_AGGREGATE]: "proof-of-reserves (voluntary)",
};

// The compliance-critical entry points. The live pool emits NO event from any of its setters
// (THREAT_MODEL 3.12), so this list is the only way a deny-list or ASP-root change is detectable:
// the function name is in the transaction envelope even when nothing is emitted.
export const ADMIN_SETTERS = [
  "set_asp_root",
  "set_deny_list",
  "set_auditor",
  "set_fx_oracle",
  "set_policy",
  "set_admin",
  "upgrade",
  "propose",
  "execute",
  "cancel",
  "migrate",
] as const;

// Error enums, transcribed from the contracts. Codes are per-contract, so they are keyed by it.
// contracts/pool/src/lib.rs 1..15; pool-enforced and pool-timelock share those and add their own.
const POOL_ERRORS: Record<number, string> = {
  1: "UnknownRoot",
  2: "NullifierUsed",
  3: "UnknownCommitment",
  4: "BadDenyList",
  5: "InvalidAmount",
  6: "AmountNotBound",
  7: "ProofRejected",
  8: "TreeFull",
  9: "LeafAlreadyInserted",
  10: "DuplicateCommitment",
  11: "FxUnavailable",
  12: "SlippageExceeded",
  13: "BadIoCount",
  14: "NonCanonicalField",
  15: "UnknownAuditRequest",
  16: "PolicyExceeded",
  17: "AlreadyMigrated",
  20: "TimelockNotReady",
  21: "TimelockEmpty",
  22: "PolicyRequired",
  // 23 and 24 exist only on the preview pools. 23 is pool-enforced's exit compliance gate,
  // 24 is pool-accumulator's registered-cap check; the numbers do not overlap so one table
  // still covers the whole family, which is why they were assigned that way.
  23: "ExitComplianceRequired",
  24: "AuditCapMismatch",
};
const RESERVES_ERRORS: Record<number, string> = { 1: "ProofRejected", 2: "Insolvent", 3: "TooManyLeaves", 4: "InvalidAmount" };
const RESERVES_AGG_ERRORS: Record<number, string> = {
  1: "NotOpen",
  2: "ProofRejected",
  3: "UnknownCommitment",
  4: "AlreadyCovered",
  5: "InvalidAmount",
  6: "BadIoCount",
  7: "NonCanonicalField",
};
const POLICY_ERRORS: Record<number, string> = { 1: "InvalidCap" };

/** Name for a contract error code, or undefined when the contract is not one whose enum we hold. */
export function errorName(contract: string | null, code: number): string | undefined {
  if (contract === POOL || contract === POOL_ENFORCED || contract === POOL_TIMELOCK) return POOL_ERRORS[code];
  if (contract === RESERVES) return RESERVES_ERRORS[code];
  if (contract === RESERVES_AGGREGATE) return RESERVES_AGG_ERRORS[code];
  if (contract === POLICY_REGISTRY) return POLICY_ERRORS[code];
  return undefined;
}

export type Severity = "critical" | "warning" | "info";

// Severity per pool error code. These are structural, not rate-based: one NullifierUsed is one
// attempted double-spend that the on-chain guard caught, and it means the same thing at any volume.
const POOL_ERROR_SEVERITY: Record<number, Severity> = {
  1: "critical", // UnknownRoot        a proof against a root the pool never accepted
  2: "critical", // NullifierUsed      replay against the double-spend guard
  3: "critical", // UnknownCommitment
  6: "critical", // AmountNotBound     released amount not bound to the verified public input
  7: "critical", // ProofRejected
  9: "critical", // LeafAlreadyInserted
  10: "critical", // DuplicateCommitment
  13: "critical", // BadIoCount        an attempt to shift the nullifier/commitment boundary
  14: "critical", // NonCanonicalField non-canonical encoding, the nullifier-aliasing guard
  // A holder answering a registered audit request with a cap other than the one the auditor
  // put on record. Nothing else produces this: the legitimate client reads the cap off the
  // request. Treat it as an attempt to answer the right question with a useless bound.
  24: "critical", // AuditCapMismatch
  11: "warning", // FxUnavailable      fails closed, no funds at risk; check the Reflector feed
  // Exit gate armed, withdraw carried no compliance proof. Usually a client that predates the
  // gate rather than an evasion, since an ineligible recipient fails as ProofRejected instead.
  23: "warning", // ExitComplianceRequired
  12: "info", // SlippageExceeded      expected under FX movement
};
export const severityForError = (contract: string | null, code: number): Severity =>
  (contract === POOL || contract === POOL_ENFORCED || contract === POOL_TIMELOCK ? POOL_ERROR_SEVERITY[code] : undefined) ?? "warning";

// ---- pure decoding --------------------------------------------------------------------------

export type Invocation = { contract: string; fn: string };

/** The top-level contract invocations in a transaction envelope (fee bumps unwrapped). */
export function invocations(envelopeXdr: string): Invocation[] {
  let tx;
  try {
    const env = Sdk.xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64");
    tx = env.type === "envelopeTypeTxFeeBump" ? env.feeBump.tx.innerTx.v1.tx : env.type === "envelopeTypeTxV0" ? env.v0.tx : env.v1.tx;
  } catch {
    return [];
  }
  const out: Invocation[] = [];
  for (const op of tx.operations) {
    if (op.body.type !== "invokeHostFunction") continue;
    const hf = op.body.invokeHostFunctionOp.hostFunction;
    if (hf.type !== "hostFunctionTypeInvokeContract") continue;
    try {
      out.push({ contract: Sdk.Address.fromScAddress(hf.invokeContract.contractAddress).toString(), fn: hf.invokeContract.functionName.toString() });
    } catch {
      /* a non-contract address cannot be an invocation we track */
    }
  }
  return out;
}

/**
 * The coarse InvokeHostFunction failure, or null when the transaction succeeded. This is all the
 * transaction RESULT carries: "trapped" covers every contract error, which is why the exact code
 * has to come from the diagnostic events.
 */
export function failureKind(resultXdr: string): string | null {
  try {
    const res = Sdk.xdr.TransactionResult.fromXDR(resultXdr, "base64");
    if (res.result.type !== "txFailed") return null;
    for (const r of res.result.results) {
      const tr = r.type === "opInner" ? r.tr : null;
      if (tr && tr.type === "invokeHostFunction") return tr.invokeHostFunctionResult.type.replace(/^invokeHostFunction/, "");
    }
    return res.result.type;
  } catch {
    return null;
  }
}

export type ContractError = { contract: string | null; code: number; name?: string };

/**
 * The contract error a failed invocation raised, from `getTransaction`'s diagnostic events. The
 * host emits several `error` diagnostics per failure (the raise, the escalation, the log); the
 * FIRST carries the contract that actually raised it, which may be a sub-invoked verifier rather
 * than the pool. Returns null for a host-level failure with no contract error.
 */
export function contractErrorFrom(diagnostics: readonly Sdk.xdr.DiagnosticEvent[] | undefined): ContractError | null {
  for (const d of diagnostics ?? []) {
    const body = d.event.body;
    if (body.type !== "v0") continue;
    const err = body.v0.topics.find((t) => t.type === "scvError");
    if (!err || err.error.type !== "sceContract") continue;
    let contract: string | null = null;
    try {
      contract = d.event.contractId ? Sdk.StrKey.encodeContract(d.event.contractId.value) : null;
    } catch {
      contract = null;
    }
    const code = err.error.contractCode;
    return { contract, code, name: errorName(contract, code) };
  }
  return null;
}

// ---- the read -------------------------------------------------------------------------------

export type TxRecord = {
  hash: string;
  at: number; // unix seconds
  ledger: number;
  successful: boolean;
  source: string; // the submitting account
  invocations: Invocation[];
  /** Coarse InvokeHostFunction result, present on every failure. Available for all history. */
  failure?: string;
  /** The exact contract error. Only recoverable while the tx is inside the RPC retention window. */
  error?: ContractError | null;
  /** false when the tx has aged out of RPC retention, so `error` is unknown rather than absent. */
  errorRecoverable: boolean;
};

export type WatchedAccount = { address: string; role: string };

export type TxMonWindow = {
  horizon: string;
  accounts: WatchedAccount[];
  /** Newest first. Only transactions with a top-level invocation of a WATCHED contract. */
  records: TxRecord[];
  /** Below this ledger the RPC no longer holds diagnostics, so error codes are gone. */
  retentionFromLedger: number;
  latestLedger: number;
  /** Accounts whose Horizon read failed, so the view is incomplete. */
  unread: string[];
  checkedAt: number;
};

type HorizonTx = { hash: string; created_at: string; ledger: number; successful: boolean; source_account: string; envelope_xdr: string; result_xdr: string };

/** One page of an account's transaction history, failed ones included, newest first. */
export async function readAccountTxs(account: string, limit = 200): Promise<TxRecord[]> {
  const url = `${HORIZON}/accounts/${encodeURIComponent(account)}/transactions?include_failed=true&order=desc&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`horizon ${res.status} for ${account.slice(0, 8)}`);
  const body = (await res.json()) as { _embedded?: { records?: HorizonTx[] } };
  return (body._embedded?.records ?? []).map((t) => ({
    hash: t.hash,
    at: Math.floor(Date.parse(t.created_at) / 1000),
    ledger: t.ledger,
    successful: t.successful,
    source: t.source_account,
    invocations: invocations(t.envelope_xdr),
    ...(t.successful ? {} : { failure: failureKind(t.result_xdr) ?? "failed" }),
    errorRecoverable: false,
  }));
}

/** Keep only the transactions that touched a contract we watch. */
export const watchedOnly = (recs: TxRecord[]): TxRecord[] => recs.filter((r) => r.invocations.some((i) => i.contract in WATCHED));

/**
 * The relayer / demo key, which signs the recurring sends and the no-install demo's real writes.
 * RELAYER_SECRET is server-only, so a browser resolves this to the demo key and the cron sweep
 * resolves it to the deployment's real relayer when one is configured. Both are correct for where
 * they run; the console labels whichever account it actually read.
 */
export function relayerAddress(): string | null {
  try {
    return Sdk.Keypair.fromSecret(process.env.RELAYER_SECRET || DEMO_SECRET).publicKey();
  } catch {
    return null;
  }
}

/**
 * Every account this corridor transacts with, and why it is watched. The auditor is read from the
 * live pool rather than pinned, so the watch follows a `set_auditor` change instead of going stale.
 */
export async function watchedAccounts(): Promise<WatchedAccount[]> {
  const out: WatchedAccount[] = [{ address: SOURCE, role: "operator / admin key" }];
  const relayer = relayerAddress();
  if (relayer && relayer !== SOURCE) out.push({ address: relayer, role: "relayer / demo key" });
  // Best effort: if the auditor read fails the other two accounts still report.
  const r = await simulate(POOL, "auditor").catch(() => ({ ok: false }) as const);
  if (r.ok && typeof r.value === "string" && !out.some((a) => a.address === r.value)) out.push({ address: r.value, role: "pool auditor" });
  return out;
}

/**
 * The transaction-level window: watched accounts' invocations of watched contracts, newest first,
 * with the exact contract error filled in for the failures still inside RPC retention.
 */
export async function readTxMonitoring(perAccount = 200): Promise<TxMonWindow> {
  const [health, accounts] = await Promise.all([server.getHealth(), watchedAccounts()]);
  const reads = await Promise.all(
    accounts.map((a) =>
      readAccountTxs(a.address, perAccount).then(
        (recs) => ({ address: a.address, recs }),
        () => ({ address: a.address, recs: null as TxRecord[] | null }),
      ),
    ),
  );
  const unread = reads.filter((r) => !r.recs).map((r) => r.address);
  const seen = new Set<string>();
  const records = watchedOnly(reads.flatMap((r) => r.recs ?? []))
    .filter((r) => (seen.has(r.hash) ? false : seen.add(r.hash) && true)) // an account can appear twice
    .sort((a, b) => b.at - a.at || b.ledger - a.ledger);

  // Only failures need the second call, and only while the RPC still holds their diagnostics.
  await Promise.all(
    records
      .filter((r) => !r.successful && r.ledger >= health.oldestLedger)
      .map(async (r) => {
        r.errorRecoverable = true;
        try {
          const tx = await server.getTransaction(r.hash);
          if (tx.status !== Sdk.rpc.Api.GetTransactionStatus.NOT_FOUND) r.error = contractErrorFrom(tx.diagnosticEventsXdr);
          else r.errorRecoverable = false;
        } catch {
          r.errorRecoverable = false;
        }
      }),
  );

  return {
    horizon: HORIZON,
    accounts,
    records,
    retentionFromLedger: health.oldestLedger,
    latestLedger: health.latestLedger,
    unread,
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

// ---- rules ------------------------------------------------------------------------------------

export type Finding = {
  id: string; // stable across runs, so an alert is sent once
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  at: number; // unix seconds
  txHash?: string;
};

const label = (contract: string) => WATCHED[contract] ?? contract.slice(0, 8) + "…";
const isSetter = (fn: string) => (ADMIN_SETTERS as readonly string[]).includes(fn);

/**
 * Every rule here is structurally true at any volume: it fires on a thing that is wrong or
 * privileged by its nature, never on a rate compared against a baseline this corridor does not
 * have yet. The rate rules the plan wants are listed in THRESHOLDS with no number, on purpose.
 */
export function evaluate(input: { records: TxRecord[]; adminAccount: string; adminEvents: MonEvent[]; windowTruncated: boolean }): Finding[] {
  const out: Finding[] = [];

  for (const r of input.records) {
    const inv = r.invocations.find((i) => i.contract in WATCHED)!;
    const where = `${inv.fn} on the ${label(inv.contract)}`;
    const who = r.source === input.adminAccount ? "the operator / admin key" : r.source.slice(0, 8) + "…";

    if (!r.successful) {
      // A reverted invocation. The exact code raises or lowers the severity; without it (aged out
      // of RPC retention) the coarse kind still shows, at warning.
      const sev: Severity = r.error ? severityForError(r.error.contract, r.error.code) : "warning";
      const named = r.error ? `${r.error.name ?? "error"} (#${r.error.code})` : r.errorRecoverable ? `no contract error (${r.failure})` : "error code aged out of RPC retention";
      out.push({
        id: `failed-invocation:${r.hash}`,
        rule: "failed-invocation",
        severity: r.source === input.adminAccount && sev === "info" ? "warning" : sev,
        title: `Reverted: ${where}`,
        detail: `${named}. Submitted by ${who}. Host result: ${r.failure}.`,
        at: r.at,
        txHash: r.hash,
      });
      continue;
    }

    if (r.source === input.adminAccount && isSetter(inv.fn)) {
      // The live pool emits nothing from its setters, so this is the only on-chain evidence that
      // a compliance-critical value changed. Rare and high-privilege by definition: no baseline.
      out.push({
        id: `admin-setter:${r.hash}`,
        rule: "admin-setter",
        severity: "critical",
        title: `Admin write: ${where}`,
        detail: `A compliance-critical setter was invoked by the operator key and succeeded. Reconcile it against an expected change. The live pool emits no event for this call, so the transaction is the only record.`,
        at: r.at,
        txHash: r.hash,
      });
    }
  }

  for (const e of input.adminEvents) {
    out.push({
      id: `admin-event:${e.txHash}:${e.kind}`,
      rule: "admin-event",
      severity: "warning",
      title: `${e.kind} on ${label(e.contract)}`,
      detail: [e.detail, e.data].filter(Boolean).join(" · ") || "Reconcile against an expected operator change.",
      at: e.closedAt,
      txHash: e.txHash,
    });
  }

  if (input.windowTruncated) {
    out.push({
      id: `window-truncated:${Math.floor(Date.now() / 86_400_000)}`,
      rule: "window-truncated",
      severity: "info",
      title: "Event window was truncated",
      detail: "readMonitoringWindow hit its page cap before reaching the chain head, so the event counts on this page are incomplete.",
      at: Math.floor(Date.now() / 1000),
    });
  }

  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.at - a.at);
}

// ---- thresholds --------------------------------------------------------------------------------

export type Threshold = {
  rule: string;
  basis: string;
  /** null means DELIBERATELY UNSET: the rule needs a traffic baseline that does not exist yet. */
  value: string | null;
  note: string;
};

/**
 * What is set and what is not. A threshold invented without traffic to tune it against is worse
 * than no threshold, so the rate rules below carry null and the console renders that as "unset",
 * not as a number. THREAT_MODEL 5.3 marks the same rows "baseline pending".
 */
export const THRESHOLDS: Threshold[] = [
  { rule: "failed-invocation", basis: "one occurrence", value: "1", note: "Structural. A reverted invocation of a watched contract means a guard fired; severity comes from the contract error code, not from a rate." },
  { rule: "admin-setter", basis: "one occurrence", value: "1", note: "Structural. A compliance-critical setter by the operator key is rare and high-privilege by definition." },
  { rule: "admin-event", basis: "one occurrence", value: "1", note: "Structural. A policy-registry write or a timelock propose / execute / cancel is an operator change to reconcile." },
  { rule: "deposit-velocity", basis: "deposits per hour against a rolling baseline", value: null, note: "No baseline. There is no corridor traffic to tune against, and a number picked now would fire on the first real day." },
  { rule: "near-cap-structuring", basis: "share of deposits inside the 10% band under a cap", value: null, note: "No baseline. The 10% band is the heuristic's shape, not an alerting threshold; what share is abnormal needs real traffic." },
  { rule: "repeated-actor", basis: "deposits by one actor in 24h", value: null, note: "No baseline. The console's N is an operator-chosen filter for looking, not a threshold for paging." },
  { rule: "revert-rate", basis: "failed share of invocations over a window", value: null, note: "No baseline, and not computable here: the denominator is every invocation by every account, which no public API indexes by contract." },
];

// ---- alerting ----------------------------------------------------------------------------------

/** Severities that leave the browser. Info is console-only. */
export const ALERT_SEVERITIES: readonly Severity[] = ["critical", "warning"];

/** Findings worth alerting on that have not been alerted on before. */
export function unseen(findings: Finding[], seen: readonly string[]): Finding[] {
  const s = new Set(seen);
  return findings.filter((f) => ALERT_SEVERITIES.includes(f.severity) && !s.has(f.id));
}

/** The Web Push payload for a finding. `url` is the same-origin path the notification opens. */
export function alertPayload(f: Finding): { title: string; body: string; url: string; kind: string } {
  return {
    title: `${f.severity === "critical" ? "Critical" : "Warning"}: ${f.title}`,
    body: f.detail.slice(0, 300),
    url: "/operator",
    kind: "operator-alert",
  };
}
